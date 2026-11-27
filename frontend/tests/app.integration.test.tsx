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
  
  // Set up a goal where the user needs to enter their own tasks.
  async function openManualTaskEntry() {
    await client.register('manual-ui@example.com', 'correct-horse-battery')
    await client.verifyEmail('test-confirmation-token')

    backend.failNextTaskGeneration()

    const user = userEvent.setup()
    render(<App api={client} />)

    await screen.findByRole('heading', { name: 'Your goals' })
    await user.click(screen.getByRole('button', { name: 'New Goal' }))

    await user.type(
      screen.getByPlaceholderText('e.g. Launch my app to 100 users'),
      'Prepare for my SWE final'
    )

    await user.type(
      screen.getByPlaceholderText('Add context that will help create useful tasks.'),
      'Review my notes and practice the topics I need more help with.'
    )

    const deadline = new Date()
    deadline.setDate(deadline.getDate() + 30)

    const date = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`

    fireEvent.change(document.querySelector('input[type="date"]')!, {
      target: { value: date },
    })

    await user.click(screen.getByRole('button', {
      name: /save goal & generate tasks/i,
    }))

    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', {
      name: 'Enter Manually',
    }))

    return user
  }

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

  // Check that manually entered tasks are saved in the correct order.
  it('saves manual tasks and retrieves them for the correct goal', async () => {
    await client.register('manual@example.com', 'correct-horse-battery')
    await client.verifyEmail('test-confirmation-token')

    const goal = await client.createGoal({
      title: 'Finish my SWE group project',
      description: 'Complete my assigned work before the final presentation.',
      deadline: '2027-01-15',
    })

    const manualTasks = [
      {
        title: 'Finish my assigned code',
        description: 'Complete the remaining parts of my implementation.',
      },
      {
        title: 'Run the test cases',
        description: 'Make sure the existing and new tests pass.',
      },
      {
        title: 'Prepare the presentation',
        description: 'Update the slides with our final project results.',
      },
    ]

    const savedTasks = await client.createManualTasks(goal.id, manualTasks)

    expect(savedTasks).toHaveLength(3)
    expect(savedTasks.map(task => task.title))
      .toEqual(manualTasks.map(task => task.title))
    expect(savedTasks.map(task => task.display_order)).toEqual([1, 2, 3])
    expect(savedTasks.every(task => task.goal_id === goal.id)).toBe(true)
    expect(await client.getTasks(goal.id)).toEqual(savedTasks)
  })

  // A user should be able to save a goal with just one task.
  it('allows a goal to have one manual task', async () => {
    await client.register('single@example.com', 'correct-horse-battery')
    await client.verifyEmail('test-confirmation-token')

    const goal = await client.createGoal({
      title: 'Submit my assignment',
      description: 'Finish and submit my assignment on time.',
      deadline: '2027-01-15',
    })

    const savedTasks = await client.createManualTasks(goal.id, [
      {
        title: 'Submit the assignment',
        description: 'Review my work and upload the final document.',
      },
    ])

    expect(savedTasks).toHaveLength(1)
    expect(savedTasks[0].display_order).toBe(1)
    expect(await client.getTasks(goal.id)).toEqual(savedTasks)
  })

  // Check the maximum number of tasks allowed for one goal.
  it('allows a goal to have seven manual tasks', async () => {
    await client.register('maximum@example.com', 'correct-horse-battery')
    await client.verifyEmail('test-confirmation-token')

    const goal = await client.createGoal({
      title: 'Prepare for finals week',
      description: 'Study a different topic during each study session.',
      deadline: '2027-01-15',
    })

    const manualTasks = Array.from({ length: 7 }, (_, index) => ({
      title: `Study session ${index + 1}`,
      description: `Review the material for topic ${index + 1}.`,
    }))

    const savedTasks = await client.createManualTasks(goal.id, manualTasks)

    expect(savedTasks).toHaveLength(7)
    expect(savedTasks.map(task => task.display_order))
      .toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(await client.getTasks(goal.id)).toEqual(savedTasks)
  })

  // Invalid tasks should not be saved to the goal.
  it('rejects manual tasks with missing information', async () => {
    await client.register('invalid@example.com', 'correct-horse-battery')
    await client.verifyEmail('test-confirmation-token')

    const goal = await client.createGoal({
      title: 'Create a study schedule',
      description: 'Plan out my study sessions for the week.',
      deadline: '2027-01-15',
    })

    await expect(client.createManualTasks(goal.id, [
      {
        title: '',
        description: 'Review my class notes.',
      },
    ])).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    })

    await expect(client.createManualTasks(goal.id, [
      {
        title: 'Review notes',
        description: '   ',
      },
    ])).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    })

    expect(await client.getTasks(goal.id)).toEqual([])
  })

  // Saving another set of tasks should not overwrite the original tasks.
  it('prevents saving a second set of tasks for the same goal', async () => {
    await client.register('duplicate@example.com', 'correct-horse-battery')
    await client.verifyEmail('test-confirmation-token')

    const goal = await client.createGoal({
      title: 'Stay on top of my assignments',
      description: 'Complete my assignments before their deadlines.',
      deadline: '2027-01-15',
    })

    const originalTasks = await client.createManualTasks(goal.id, [
      {
        title: 'Check upcoming deadlines',
        description: 'Make a list of assignments that are due.',
      },
    ])

    await expect(client.createManualTasks(goal.id, [
      {
        title: 'Create another task',
        description: 'Try saving a second set of tasks.',
      },
    ])).rejects.toMatchObject({
      status: 409,
      code: 'TASKS_ALREADY_GENERATED',
    })

    expect(await client.getTasks(goal.id)).toEqual(originalTasks)
  })

  // Users should not be able to access or change someone else's tasks.
  it('prevents another user from accessing or adding tasks to a goal', async () => {
    await client.register('owner@example.com', 'correct-horse-battery')
    await client.verifyEmail('test-confirmation-token')

    const goal = await client.createGoal({
      title: 'Improve my coding skills',
      description: 'Practice coding throughout the semester.',
      deadline: '2027-01-15',
    })

    const originalTasks = await client.createManualTasks(goal.id, [
      {
        title: 'Practice coding',
        description: 'Complete a few practice problems.',
      },
    ])

    client.logout()

    await client.register('other@example.com', 'correct-horse-battery')
    await client.verifyEmail('test-confirmation-token')

    await expect(client.getTasks(goal.id)).rejects.toMatchObject({
      status: 404,
      code: 'GOAL_NOT_FOUND',
    })

    await expect(client.createManualTasks(goal.id, [
      {
        title: 'Add an unauthorized task',
        description: 'Try adding a task to another user’s goal.',
      },
    ])).rejects.toMatchObject({
      status: 404,
      code: 'GOAL_NOT_FOUND',
    })

    client.logout()

    await client.login('owner@example.com', 'correct-horse-battery')
    expect(await client.getTasks(goal.id)).toEqual(originalTasks)
  })

  // Make sure the user can enter tasks manually if AI generation fails.
  it('switches from AI generation to manual task entry', async () => {
    await openManualTaskEntry()

    expect(screen.getByLabelText('Task 1 title')).toBeInTheDocument()
    expect(screen.getByLabelText('Task 1 description')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save tasks/i }))
      .toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // The user should be able to change their task before saving it.
  it('allows the user to enter and edit a manual task', async () => {
    const user = await openManualTaskEntry()

    const title = screen.getByLabelText('Task 1 title')
    const description = screen.getByLabelText('Task 1 description')

    await user.type(title, 'Review notes')
    await user.type(description, 'Read through my class notes.')

    await user.clear(title)
    await user.type(title, 'Review SWE modules')

    await user.clear(description)
    await user.type(description, 'Review the modules covered on the final.')

    expect(title).toHaveValue('Review SWE modules')
    expect(description).toHaveValue(
      'Review the modules covered on the final.'
    )
  })

  // Check that the user can add more than one task to their goal.
  it('allows the user to add multiple manual tasks', async () => {
    const user = await openManualTaskEntry()

    await user.click(screen.getByRole('button', { name: /add step/i }))
    await user.click(screen.getByRole('button', { name: /add step/i }))

    expect(screen.getAllByLabelText(/^Task \d+ title$/)).toHaveLength(3)
    expect(screen.getAllByLabelText(/^Task \d+ description$/))
      .toHaveLength(3)
  })

  // Removing one task should not remove the other tasks.
  it('removes an unwanted task and keeps the remaining task', async () => {
    const user = await openManualTaskEntry()

    await user.type(
      screen.getByLabelText('Task 1 title'),
      'Review lecture notes'
    )

    await user.click(screen.getByRole('button', { name: /add step/i }))

    await user.type(
      screen.getByLabelText('Task 2 title'),
      'Review old assignments'
    )

    await user.click(screen.getByRole('button', {
      name: 'Delete task 2',
    }))

    expect(screen.queryByLabelText('Task 2 title'))
      .not.toBeInTheDocument()

    expect(screen.getByLabelText('Task 1 title'))
      .toHaveValue('Review lecture notes')
  })

  // A goal needs at least one task.
  it('prevents the user from deleting the only remaining task', async () => {
    await openManualTaskEntry()

    expect(screen.getByRole('button', { name: 'Delete task 1' }))
      .toBeDisabled()

    expect(screen.getAllByLabelText(/^Task \d+ title$/)).toHaveLength(1)
  })

  // The user should not be able to add more than seven tasks.
  it('limits manual task entry to seven tasks', async () => {
    const user = await openManualTaskEntry()

    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole('button', { name: /add step/i }))
    }

    expect(screen.getAllByLabelText(/^Task \d+ title$/)).toHaveLength(7)

    expect(screen.queryByRole('button', { name: /add step/i }))
      .not.toBeInTheDocument()
  })

  // Make sure incomplete tasks are not saved.
  it('shows an error when required task information is missing', async () => {
    const user = await openManualTaskEntry()

    await user.type(
      screen.getByLabelText('Task 1 title'),
      'Review practice questions'
    )

    await user.click(screen.getByRole('button', {
      name: /save tasks/i,
    }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Each task needs a title and description within the character limits.'
    )

    const goals = await client.listGoals()
    expect(goals).toHaveLength(1)
    expect(await client.getTasks(goals[0].id)).toEqual([])
  })

  // Check the full process of creating and saving tasks through the UI.
  it('saves manual tasks and displays them on the saved goal page', async () => {
    const user = await openManualTaskEntry()

    await user.type(
      screen.getByLabelText('Task 1 title'),
      'Review SWE modules'
    )

    await user.type(
      screen.getByLabelText('Task 1 description'),
      'Go through the notes from each module.'
    )

    await user.click(screen.getByRole('button', { name: /add step/i }))

    await user.type(
      screen.getByLabelText('Task 2 title'),
      'Complete practice questions'
    )

    await user.type(
      screen.getByLabelText('Task 2 description'),
      'Practice the topics I need more help with.'
    )

    await user.click(screen.getByRole('button', {
      name: /save tasks/i,
    }))

    expect(await screen.findByRole('heading', {
      name: 'Prepare for my SWE final',
    })).toBeInTheDocument()

    expect(screen.getByText('Review SWE modules')).toBeInTheDocument()
    expect(screen.getByText('Complete practice questions'))
      .toBeInTheDocument()

    const goals = await client.listGoals()
    const savedTasks = await client.getTasks(goals[0].id)

    expect(savedTasks).toHaveLength(2)
    expect(savedTasks.map(task => task.title)).toEqual([
      'Review SWE modules',
      'Complete practice questions',
    ])
  })

})
