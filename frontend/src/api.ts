import type { Milestone, Wager } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') ?? ''
const STORAGE_KEY = 'wagerly:wagers'

export const isLocalMode = API_BASE_URL.length === 0

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  const body = await response.text()
  if (!response.ok) {
    throw new Error(body || `Request failed with status ${response.status}`)
  }
  if (!body) throw new Error(`The API returned an empty response for ${path}`)

  try {
    return JSON.parse(body) as T
  } catch {
    throw new Error(`The API returned invalid JSON for ${path}`)
  }
}

function readLocalWagers(): Wager[] {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return []

  try {
    const wagers: unknown = JSON.parse(stored)
    if (!Array.isArray(wagers)) throw new Error('Stored goals must be a list.')
    return wagers as Wager[]
  } catch (error) {
    throw new Error(
      `Could not read locally saved goals: ${error instanceof Error ? error.message : 'invalid data'}`,
    )
  }
}

function writeLocalWagers(wagers: Wager[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wagers))
}

export function getWagers(): Promise<Wager[]> {
  return isLocalMode ? Promise.resolve(readLocalWagers()) : request<Wager[]>('/api/wagers')
}

export async function createWager(wager: Omit<Wager, 'id'>): Promise<Wager> {
  if (!isLocalMode) {
    return request<Wager>('/api/wagers', {
      method: 'POST',
      body: JSON.stringify(wager),
    })
  }

  const wagers = readLocalWagers()
  const created = { ...wager, id: crypto.randomUUID() }
  writeLocalWagers([created, ...wagers])
  return created
}

export async function updateWager(wager: Wager): Promise<Wager> {
  if (!isLocalMode) {
    return request<Wager>(`/api/wagers/${encodeURIComponent(wager.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(wager),
    })
  }

  const wagers = readLocalWagers()
  const index = wagers.findIndex(item => item.id === wager.id)
  if (index < 0) throw new Error('This goal no longer exists in local storage.')
  wagers[index] = wager
  writeLocalWagers(wagers)
  return wager
}

export function generateMilestones(input: {
  goal: string
  deadline: string
}): Promise<Milestone[]> {
  if (isLocalMode) {
    return Promise.reject(
      new Error('AI planning needs a connected backend. You can create milestones manually in local mode.'),
    )
  }

  return request<Milestone[]>('/api/wagers/plan', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
