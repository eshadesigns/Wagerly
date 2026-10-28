export interface AuthUser {
  id: string
  email: string
}

export interface AuthSession {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_in?: number
  expires_at?: number
  user?: AuthUser
}

export interface AuthResponse {
  user: AuthUser
  session: AuthSession | null
  emailConfirmationRequired?: boolean
}

export interface Goal {
  id: string
  user_id: string
  title: string
  description: string
  deadline: string
  created_at: string
}

export interface Task {
  id: string
  goal_id: string
  title: string
  description: string
  display_order: number
  created_at: string
}

export interface GoalWithTasks extends Goal {
  tasks: Task[]
}

// Retained for the unconnected Sprint 2 presentation components below.
export type WagerStatus = 'on-track' | 'at-risk' | 'completed' | 'missed'
export type StakeType = 'financial' | 'custom'

export interface Milestone {
  id: string
  title: string
  dueDate: string
  completed: boolean
  verified: boolean
  pendingVerification: boolean
}

export interface Wager {
  id: string
  goal: string
  deadline: string
  progress: number
  status: WagerStatus
  milestones: Milestone[]
  stake: { type: StakeType; amount?: number; description?: string }
  partner: { name: string; handle: string; initials: string; color: string }
  createdAt: string
}

export interface CreateState {
  goal: string
  deadline: string
  planMode: 'ai' | 'manual' | null
  milestones: Milestone[]
  stakeType: StakeType | null
  stakeAmount: string
  stakeDescription: string
  partnerName: string
  partnerHandle: string
}
