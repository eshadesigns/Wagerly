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
