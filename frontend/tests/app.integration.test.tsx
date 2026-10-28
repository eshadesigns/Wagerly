import { randomUUID } from 'node:crypto'
import { HttpError } from '../../backend/src/errors.js'
import { createApp } from '../../backend/src/index.js'
import App from '../src/App'
import { createApiClient } from '../src/api'
import type { AuthSession, AuthUser, Goal, Task } from '../src/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface TestUser extends AuthUser {
  password: string
  confirmed: boolean
}

function createTestBackend() {
  const usersByEmail = new Map<string, TestUser>()
  const usersById = new Map<string, TestUser>()
  const accessTokens = new Map<string, string>()
  const refreshTokens = new Map<string, string>()
  const confirmationTokens = new Map<string, string>()
  const goals: Goal[] = []
  const tasks: Task[] = []
  let refreshCount = 0
  let failNextGeneration = false

  function makeSession(user: TestUser): AuthSession {
    const accessToken = `access-${randomUUID()}`
    const refreshToken = `refresh-${randomUUID()}`
    accessTokens.set(accessToken, user.id)
    refreshTokens.set(refreshToken, user.id)
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: user.id, email: user.email },
    }
  }

  function createClient(_env: NodeJS.ProcessEnv, accessToken?: string) {
    const userId = accessToken ? accessTokens.get(accessToken) : undefined
    return {
      auth: {
        async signUp({ email, password }: { email: string; password: string }) {
          if (usersByEmail.has(email)) {
            return { data: { user: null, session: null }, error: { code: 'email_exists', status: 422 } }
          }
          const user: TestUser = { id: randomUUID(), email, password, confirmed: false }
          usersByEmail.set(email, user)
          usersById.set(user.id, user)
          confirmationTokens.set('test-confirmation-token', user.id)
          return { data: { user, session: null }, error: null }
        },
        async signInWithPassword({ email, password }: { email: string; password: string }) {
          const user = usersByEmail.get(email)
          if (!user || user.password !== password) {
            return { data: { user: null, session: null }, error: { status: 400, code: 'invalid_credentials' } }
          }
          if (!user.confirmed) {
            return { data: { user, session: null }, error: { status: 400, code: 'email_not_confirmed' } }
          }
          return { data: { user, session: makeSession(user) }, error: null }
        },
        async verifyOtp({ token_hash }: { token_hash: string }) {
          const id = confirmationTokens.get(token_hash)
          const user = id ? usersById.get(id) : undefined
          if (!user || user.confirmed) {
            return { data: { user: null, session: null }, error: { status: 400, code: 'otp_expired' } }
          }
          user.confirmed = true
          confirmationTokens.delete(token_hash)
          return { data: { user, session: makeSession(user) }, error: null }
        },
        async refreshSession({ refresh_token }: { refresh_token: string }) {
          refreshCount += 1
          const id = refreshTokens.get(refresh_token)
          const user = id ? usersById.get(id) : undefined
          if (!user) return { data: { user: null, session: null }, error: { status: 401 } }
          refreshTokens.delete(refresh_token)
          return { data: { user, session: makeSession(user) }, error: null }
        },
        async getUser(token: string) {
          const id = accessTokens.get(token)
          const user = id ? usersById.get(id) : undefined
          return user
            ? { data: { user }, error: null }
            : { data: { user: null }, error: { status: 401 } }
        },
      },
      from(table: 'goals' | 'tasks') {
        return new TestQuery(table, userId, goals, tasks)
      },
      async rpc(name: string, args: { p_goal_id: string; p_tasks: Array<{ title: string; description: string }> }) {
        if (name !== 'create_goal_tasks') return { data: null, error: { message: 'Unknown RPC' } }
        const goal = goals.find(item => item.id === args.p_goal_id && item.user_id === userId)
        if (!goal) return { data: null, error: { message: 'GOAL_NOT_FOUND' } }
        if (tasks.some(task => task.goal_id === goal.id)) {
          return { data: null, error: { message: 'TASKS_ALREADY_GENERATED' } }
        }
        const saved = args.p_tasks.map((task, index) => ({
          id: randomUUID(),
          goal_id: goal.id,
          title: task.title,
          description: task.description,
          display_order: index + 1,
          created_at: new Date().toISOString(),
        }))
        tasks.push(...saved)
        return { data: saved, error: null }
      },
    }
  }

  class TestQuery {
    private inserted: Record<string, unknown> | null = null
    private filters = new Map<string, unknown>()
    private orderBy: string | null = null

    constructor(
      private readonly table: 'goals' | 'tasks',
      private readonly userId: string | undefined,
      private readonly goals: Goal[],
      private readonly tasks: Task[],
    ) {}

    insert(value: Record<string, unknown>) { this.inserted = value; return this }
    select(_columns: string) { return this }
    eq(field: string, value: unknown) { this.filters.set(field, value); return this }
    order(field: string) { this.orderBy = field; return this }

    async single() {
      const { data, error } = await this.execute()
      return { data: Array.isArray(data) ? data[0] ?? null : data, error }
    }

    async maybeSingle() {
      const { data, error } = await this.execute()
      return { data: Array.isArray(data) ? data[0] ?? null : data, error }
    }

    then(resolve: (value: { data: unknown; error: null }) => unknown, reject: (error: unknown) => unknown) {
      return this.execute().then(resolve, reject)
    }

    private async execute(): Promise<{ data: unknown; error: null }> {
      if (this.inserted) {
        if (this.table !== 'goals' || this.inserted.user_id !== this.userId) {
          return { data: null, error: null }
        }
        const goal = {
          ...this.inserted,
          id: randomUUID(),
          created_at: new Date().toISOString(),
        } as Goal
        this.goals.push(goal)
        return { data: [goal], error: null }
      }

      const source = this.table === 'goals' ? this.goals : this.tasks
      let rows = source.filter(row => {
        if (this.table === 'goals') {
          const goal = row as Goal
          if (goal.user_id !== this.userId) return false
        } else {
          const task = row as Task
          if (!this.goals.some(goal => goal.id === task.goal_id && goal.user_id === this.userId)) return false
        }
        return [...this.filters].every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)
      })
      if (this.orderBy) {
        const key = this.orderBy
        rows = [...rows].sort((a, b) => String((a as unknown as Record<string, unknown>)[key]).localeCompare(String((b as unknown as Record<string, unknown>)[key])))
      }
      return { data: rows, error: null }
    }
  }

  const app = createApp({
    env: { FRONTEND_ORIGIN: 'http://localhost:5173' } as NodeJS.ProcessEnv,
    createClient: createClient as never,
    generateGoalTasks: async () => {
      if (failNextGeneration) {
        failNextGeneration = false
        throw new HttpError(504, 'AI_TIMEOUT', 'Gemini took too long to respond. Please try again.')
      }
      return [
        { title: 'Define the first milestone', description: 'Write down the measurable first outcome.' },
        { title: 'Complete a focused work session', description: 'Reserve time and complete the first concrete task.' },
        { title: 'Review progress and adjust', description: 'Compare the result with your target and plan the next step.' },
      ]
    },
    logger: () => {},
  })

  return {
    app,
    getRefreshCount: () => refreshCount,
    failNextTaskGeneration: () => { failNextGeneration = true },
  }
}

describe('frontend and Express integration', () => {
  let server: ReturnType<ReturnType<typeof createApp>['listen']>
  let client: ReturnType<typeof createApiClient>
  let backend: ReturnType<typeof createTestBackend>
  let baseUrl: string

  beforeEach(async () => {
    window.localStorage.clear()
    backend = createTestBackend()
    server = backend.app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test server did not start.')
    baseUrl = `http://127.0.0.1:${address.port}`
    client = createApiClient({ baseUrl, storage: window.localStorage })
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })

  it('registers, confirms, logs in, creates goals, generates tasks, and renews concurrent sessions', async () => {
    await expect(client.register('bad-email', 'long-enough-password')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    })

    const signup = await client.register('integration@example.com', 'correct-horse-battery')
    expect(signup.session).toBeNull()
    expect(signup.emailConfirmationRequired).toBe(true)

    await expect(client.login('integration@example.com', 'incorrect-password')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    })
    await expect(client.createGoal({
      title: 'Unauthorized goal',
      description: '',
      deadline: '2027-01-01',
    })).rejects.toMatchObject({ status: 401, code: 'AUTHENTICATION_REQUIRED' })

    await client.verifyEmail('test-confirmation-token')
    const loggedIn = await client.login('integration@example.com', 'correct-horse-battery')
    expect(loggedIn.session?.access_token).toBeTruthy()

    const goal = await client.createGoal({
      title: 'Learn conversational Spanish',
      description: 'Practice consistently and build confidence speaking.',
      deadline: '2027-03-15',
    })
    expect(goal.title).toBe('Learn conversational Spanish')
    expect(goal.deadline).toContain('2027-03-15')
    expect(await client.getGoal(goal.id)).toMatchObject({ id: goal.id, title: goal.title })

    const generated = await client.generateTasks(goal.id)
    expect(generated).toHaveLength(3)
    expect(generated[0]).toMatchObject({ title: 'Define the first milestone', display_order: 1 })
    expect((await client.getTasks(goal.id)).map(task => task.id)).toEqual(generated.map(task => task.id))
    await expect(client.generateTasks(goal.id)).rejects.toMatchObject({
      status: 409,
      code: 'TASKS_ALREADY_GENERATED',
    })

    const stored = JSON.parse(window.localStorage.getItem('wagerly:session') ?? '{}') as AuthSession
    window.localStorage.setItem('wagerly:session', JSON.stringify({
      ...stored,
      expires_at: Math.floor(Date.now() / 1000) - 1,
    }))
    await Promise.all([client.listGoals(), client.getTasks(goal.id)])
    const renewed = JSON.parse(window.localStorage.getItem('wagerly:session') ?? '{}') as AuthSession
    expect(backend.getRefreshCount()).toBe(1)
    expect(renewed.refresh_token).not.toBe(stored.refresh_token)
  })

  it('shows backend task-generation errors and displays the saved task descriptions in the UI', async () => {
    await client.register('ui@example.com', 'correct-horse-battery')
    await client.verifyEmail('test-confirmation-token')
    client.logout()
    backend.failNextTaskGeneration()

    const user = userEvent.setup()
    render(<App api={client} />)

    await user.type(await screen.findByLabelText('Email address'), 'ui@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: /sign in to wagerly/i }))
    await screen.findByRole('heading', { name: 'Your goals' })

    await user.click(screen.getByRole('button', { name: 'New Goal' }))
    await user.type(screen.getByPlaceholderText('e.g. Launch my app to 100 users'), 'Build a daily writing habit')
    await user.type(screen.getByPlaceholderText('Add context that will help create useful tasks.'), 'Write and publish consistently.')
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2027-02-20' } })
    await user.click(screen.getByRole('button', { name: /save goal & generate tasks/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini took too long to respond.')
    expect(await screen.findByRole('heading', { name: 'Your next steps' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry generation/i }))
    expect(await screen.findByText('Define the first milestone')).toBeInTheDocument()
    expect(await screen.findByText('Write down the measurable first outcome.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /view saved goal/i }))
    expect(await screen.findByRole('heading', { name: 'Build a daily writing habit' })).toBeInTheDocument()
    expect(screen.getByText('Write and publish consistently.')).toBeInTheDocument()
    expect(screen.getByText('Complete a focused work session')).toBeInTheDocument()
  })

  it('registers in the UI and exchanges a confirmation token_hash from the redirect URL', async () => {
    const user = userEvent.setup()
    const firstRender = render(<App api={client} />)

    await user.click(await screen.findByRole('button', { name: 'Create a free account' }))
    await user.type(screen.getByLabelText('Email address'), 'signup-ui@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email')
    firstRender.unmount()

    window.history.pushState({}, '', '/?type=signup&token_hash=test-confirmation-token')
    render(<App api={client} />)
    await screen.findByRole('heading', { name: 'Your goals' })
    expect(window.location.search).toBe('')
    expect(client.getSession()?.user?.email).toBe('signup-ui@example.com')
  })
})
