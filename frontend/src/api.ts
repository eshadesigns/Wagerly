import type { AuthResponse, AuthSession, AuthUser, Goal, Task } from './types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ApiClientOptions {
  baseUrl?: string
  storage?: Storage | null
  onSessionExpired?: () => void
}

interface GoalListResponse {
  goals: Goal[]
}

interface GoalResponse {
  goal: Goal
}

interface TaskListResponse {
  tasks: Task[]
}

interface ErrorResponse {
  error?: {
    code?: unknown
    message?: unknown
  }
}

const SESSION_KEY = 'wagerly:session'

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<AuthSession>
  return typeof session.access_token === 'string'
    && typeof session.refresh_token === 'string'
    && session.access_token.length > 0
    && session.refresh_token.length > 0
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false
  const user = value as Partial<AuthUser>
  return typeof user.id === 'string' && typeof user.email === 'string'
}

function expiryTime(session: AuthSession): number {
  if (typeof session.expires_at === 'number') return session.expires_at * 1000
  if (typeof session.expires_in === 'number') return Date.now() + session.expires_in * 1000
  return 0
}

export function createApiClient(options: ApiClientOptions = {}) {
  const configuredBaseUrl = options.baseUrl ?? import.meta.env.VITE_API_BASE_URL
  const baseUrl = (configuredBaseUrl || 'http://localhost:3000').replace(/\/+$/, '')
  const storage = options.storage === undefined
    ? (typeof window === 'undefined' ? null : window.localStorage)
    : options.storage
  let refreshInFlight: Promise<AuthSession> | null = null

  function readSession(): AuthSession | null {
    const stored = storage?.getItem(SESSION_KEY)
    if (!stored) return null
    try {
      const parsed: unknown = JSON.parse(stored)
      return isAuthSession(parsed) ? parsed : null
    } catch {
      storage?.removeItem(SESSION_KEY)
      return null
    }
  }

  function saveSession(session: AuthSession | null) {
    if (session) {
      const savedSession = session.expires_at === undefined && session.expires_in !== undefined
        ? { ...session, expires_at: Math.floor(Date.now() / 1000) + session.expires_in }
        : session
      storage?.setItem(SESSION_KEY, JSON.stringify(savedSession))
    }
    else storage?.removeItem(SESSION_KEY)
  }

  function notifySessionExpired() {
    options.onSessionExpired?.()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wagerly:session-expired'))
    }
  }

  async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      })
    } catch {
      throw new ApiError('Could not reach the Wagerly API. Check that the backend is running and try again.', 0, 'NETWORK_ERROR')
    }

    const text = await response.text()
    let body: unknown
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        if (response.ok) {
          throw new ApiError('The API returned an invalid response.', response.status, 'INVALID_RESPONSE')
        }
      }
    }

    if (!response.ok) {
      const error = body as ErrorResponse | undefined
      const message = typeof error?.error?.message === 'string'
        ? error.error.message
        : `The request failed (${response.status}).`
      const code = typeof error?.error?.code === 'string' ? error.error.code : 'REQUEST_FAILED'
      throw new ApiError(message, response.status, code)
    }

    if (body === undefined) {
      throw new ApiError('The API returned an empty response.', response.status, 'INVALID_RESPONSE')
    }
    return body as T
  }

  async function refreshSession(expectedRefreshToken?: string): Promise<AuthSession> {
    const current = readSession()
    if (!current) throw new ApiError('Your session has expired. Please sign in again.', 401, 'SESSION_EXPIRED')
    if (expectedRefreshToken && current.refresh_token !== expectedRefreshToken) return current
    if (refreshInFlight) return refreshInFlight

    const refreshToken = current.refresh_token
    refreshInFlight = (async () => {
      try {
        const result = await send<AuthResponse>('/api/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        })
        if (!isAuthUser(result.user) || !isAuthSession(result.session)) {
          throw new ApiError('The API returned an invalid refreshed session.', 502, 'INVALID_RESPONSE')
        }
        const latest = readSession()
        if (latest && latest.refresh_token !== refreshToken) return latest
        saveSession(result.session)
        return result.session
      } catch (error) {
        const latest = readSession()
        if (latest?.refresh_token === refreshToken) {
          saveSession(null)
          notifySessionExpired()
        }
        throw error
      } finally {
        refreshInFlight = null
      }
    })()
    return refreshInFlight
  }

  async function validSession(): Promise<AuthSession> {
    const session = readSession()
    if (!session) throw new ApiError('Please sign in to continue.', 401, 'AUTHENTICATION_REQUIRED')
    if (expiryTime(session) <= Date.now() + 60_000) {
      return refreshSession(session.refresh_token)
    }
    return session
  }

  async function protectedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    let session = await validSession()
    const makeRequest = (accessToken: string) => send<T>(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
    })

    try {
      return await makeRequest(session.access_token)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error
      session = await refreshSession(session.refresh_token)
      return makeRequest(session.access_token)
    }
  }

  async function authenticate(path: string, credentials: { email: string; password: string }): Promise<AuthResponse> {
    const result = await send<AuthResponse>(path, {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
    if (!isAuthUser(result.user) || (result.session !== null && !isAuthSession(result.session))) {
      throw new ApiError('The API returned an invalid authentication response.', 502, 'INVALID_RESPONSE')
    }
    if (result.session) saveSession(result.session)
    return result
  }

  return {
    getSession: readSession,
    restoreSession: async () => {
      const session = readSession()
      if (!session) return null
      return expiryTime(session) <= Date.now() + 60_000
        ? refreshSession(session.refresh_token)
        : session
    },
    login: (email: string, password: string) => authenticate('/api/auth/login', { email, password }),
    register: (email: string, password: string) => authenticate('/api/auth/register', { email, password }),
    verifyEmail: async (tokenHash: string) => {
      const result = await send<AuthResponse>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ tokenHash }),
      })
      if (!isAuthUser(result.user) || !isAuthSession(result.session)) {
        throw new ApiError('The API returned an invalid confirmation response.', 502, 'INVALID_RESPONSE')
      }
      saveSession(result.session)
      return result
    },
    logout: () => saveSession(null),
    listGoals: async () => (await protectedRequest<GoalListResponse>('/api/goals')).goals,
    createGoal: async (goal: Pick<Goal, 'title' | 'description' | 'deadline'>) => (
      await protectedRequest<GoalResponse>('/api/goals', {
        method: 'POST',
        body: JSON.stringify(goal),
      })
    ).goal,
    getGoal: async (goalId: string) => (
      await protectedRequest<GoalResponse>(`/api/goals/${encodeURIComponent(goalId)}`)
    ).goal,
    getTasks: async (goalId: string) => (
      await protectedRequest<TaskListResponse>(`/api/goals/${encodeURIComponent(goalId)}/tasks`)
    ).tasks,
    generateTasks: async (goalId: string) => (
      await protectedRequest<TaskListResponse>(`/api/goals/${encodeURIComponent(goalId)}/tasks/generate`, {
        method: 'POST',
      })
    ).tasks,
    createManualTasks: async (goalId: string, tasks: Array<{ title: string; description: string }>) => (
      await protectedRequest<TaskListResponse>(`/api/goals/${encodeURIComponent(goalId)}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ tasks }),
      })
    ).tasks,
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
export const defaultApiClient = createApiClient()

export const getSession = defaultApiClient.getSession
export const restoreSession = defaultApiClient.restoreSession
export const login = defaultApiClient.login
export const register = defaultApiClient.register
export const verifyEmail = defaultApiClient.verifyEmail
export const logout = defaultApiClient.logout
export const listGoals = defaultApiClient.listGoals
export const createGoal = defaultApiClient.createGoal
export const getGoal = defaultApiClient.getGoal
export const getTasks = defaultApiClient.getTasks
export const generateTasks = defaultApiClient.generateTasks
export const createManualTasks = defaultApiClient.createManualTasks
