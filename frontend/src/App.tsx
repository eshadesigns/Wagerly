import { useState, useEffect, useRef } from 'react'
import {
  ApiError,
  defaultApiClient,
} from './api'
import type { ApiClient } from './api'
import type { AuthSession, CreateState, Goal, GoalWithTasks, Milestone, Task, Wager, WagerStatus } from './types'

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen = 'dashboard' | 'create' | 'detail' | 'active' | 'verify' | 'completion' | 'history'
type CreateStep = 1 | 2 | 3 | 4 | 5
type ManualTaskDraft = { id: string; title: string; description: string }

// ─── Utilities ────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | boolean | null)[]) {
  return classes.filter(Boolean).join(' ')
}

function fmtDate(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(d: string) {
  const deadline = new Date(`${d.slice(0, 10)}T00:00:00`)
  return Math.max(0, Math.ceil((deadline.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000))
}

function genId() {
  return Math.random().toString(36).slice(2, 9)
}

function calcProgress(milestones: Milestone[]) {
  if (!milestones.length) return 0
  return Math.round((milestones.filter(m => m.verified).length / milestones.length) * 100)
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  ),
  history: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="12,8 12,12 14,14"/><path d="M3.05 11a9 9 0 1 0 .5-4.5"/><polyline points="3,2 3,7 8,7"/>
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12"/>
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  chevRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9,18 15,12 9,6"/>
    </svg>
  ),
  chevLeft: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15,18 9,12 15,6"/>
    </svg>
  ),
  chevUp: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18,15 12,9 6,15"/>
    </svg>
  ),
  chevDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6,9 12,15 18,9"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2 2 0 01-2 2H8a2 2 0 01-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
    </svg>
  ),
  sparkles: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.6 1.8 1.8.6-1.8.6L19 7.8l-.6-1.8-1.8-.6 1.8-.6z"/><path d="M5 18l.4 1.2 1.2.4-1.2.4L5 21.2l-.4-1.2-1.2-.4 1.2-.4z"/>
    </svg>
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
    </svg>
  ),
  shield: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  trophy: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8,21 12,21 16,21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 4H17V13a5 5 0 01-10 0V4z"/><path d="M7,6H4a1 1 0 00-1 1v1a4 4 0 004 4"/><path d="M17,6h3a1 1 0 011 1v1a4 4 0 01-4 4"/>
    </svg>
  ),
  arrowRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/>
    </svg>
  ),
}

// ─── Base Components ──────────────────────────────────────────────────────────

function Badge({ status }: { status: WagerStatus }) {
  const map: Record<WagerStatus, { label: string; cls: string; dot: string }> = {
    'on-track': { label: 'On Track', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    'at-risk': { label: 'At Risk', cls: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-400' },
    'completed': { label: 'Completed', cls: 'bg-zinc-100 text-zinc-600 border-zinc-200', dot: 'bg-zinc-400' },
    'missed': { label: 'Missed', cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  }
  const { label, cls, dot } = map[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border', cls)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      {label}
    </span>
  )
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const color = value === 100 ? 'bg-emerald-500' : value >= 60 ? 'bg-emerald-400' : value >= 30 ? 'bg-amber-400' : 'bg-orange-400'
  return (
    <div className={cn('h-1.5 bg-zinc-100 rounded-full overflow-hidden', className)}>
      <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${value}%` }} />
    </div>
  )
}

function Avatar({ initials, size = 'md', color = 'zinc' }: { initials: string; size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' }
  const colors: Record<string, string> = {
    zinc: 'bg-zinc-200 text-zinc-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    orange: 'bg-orange-100 text-orange-700',
    amber: 'bg-amber-100 text-amber-700',
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold shrink-0', sizes[size], colors[color] ?? colors.zinc)}>
      {initials}
    </div>
  )
}

function Btn({
  children, onClick, variant = 'primary', size = 'md', disabled, className, fullWidth,
}: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'accent'
  size?: 'sm' | 'md' | 'lg'; disabled?: boolean; className?: string; fullWidth?: boolean
}) {
  const variants = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]',
    secondary: 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 active:scale-[0.98]',
    ghost: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 active:scale-[0.98]',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98]',
    danger: 'bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]',
    accent: 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]',
  }
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-sm' }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none',
        variants[variant], sizes[size], fullWidth && 'w-full', className
      )}
    >
      {children}
    </button>
  )
}

function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-2xl border border-zinc-100 shadow-sm',
        onClick && 'cursor-pointer hover:border-zinc-200 hover:shadow-md transition-all duration-200',
        className
      )}
    >
      {children}
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={cn('text-2xl font-semibold text-zinc-900', accent)}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
    </Card>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  screen, setScreen, email, onLogout,
}: {
  screen: Screen
  setScreen: (s: Screen) => void
  email: string
  onLogout: () => void
}) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: icons.home },
    { id: 'history', label: 'History', icon: icons.history },
  ] as const

  return (
    <aside className="w-56 shrink-0 bg-[#161514] flex flex-col h-screen sticky top-0 border-r border-black/10">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">W</span>
          </div>
          <span className="text-white font-semibold text-base tracking-tight">Wagerly</span>
        </div>
      </div>

      {/* Create CTA */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setScreen('create')}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
        >
          {icons.plus} New Goal
        </button>
      </div>

      <div className="px-3 py-2 flex-1">
        <p className="px-2 py-1 text-xs font-mono uppercase tracking-wider mb-1 text-[#e5f6ff]/40">Menu</p>
        {items.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setScreen(id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer mb-0.5",
              (screen === id || (screen === 'detail' && id === 'dashboard'))
                ? "bg-white/15 text-[#e5f6ff]"
                : "text-[#e5f6ff]/60 hover:text-[#e5f6ff] hover:bg-white/10"
            )}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[#e5f6ff]/80">
            {icons.user}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono text-[#e5f6ff]/40 uppercase tracking-wider leading-none">Profile</p>
            <p className="text-xs text-[#e5f6ff] font-medium truncate mt-0.5" title={email}>{email}</p>
          </div>
        </div>
        <button onClick={onLogout} className="text-xs text-[#d42295] hover:underline transition-colors cursor-pointer font-semibold">Sign out</button>
      </div>
    </aside>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({
  goals, setScreen, setSelectedId,
}: {
  goals: GoalWithTasks[]
  setScreen: (s: Screen) => void
  setSelectedId: (id: string) => void
}) {
  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-zinc-400 text-sm font-mono mb-1">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
          <h1 className="text-2xl font-semibold text-zinc-900">Your goals</h1>
        </div>
        <Btn onClick={() => setScreen('create')} size="md">{icons.plus} Create goal</Btn>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8 max-w-xl">
        <StatCard label="Personal goals" value={String(goals.length)} sub="saved to your account" />
        <StatCard label="Generated tasks" value={String(goals.reduce((count, goal) => count + goal.tasks.length, 0))} sub="AI-planned next steps" accent="text-indigo-700" />
      </div>

      <div className="mb-2">
        <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider mb-4">Goals</h2>
        <div className="flex flex-col gap-4">
          {goals.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-zinc-600 font-medium mb-1">Nothing here yet</p>
              <p className="text-zinc-400 text-sm mb-4">Create a goal and generate actionable tasks to get started.</p>
              <Btn onClick={() => setScreen('create')} size="sm">{icons.plus} Create a goal</Btn>
            </Card>
          )}
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onClick={() => { setSelectedId(goal.id); setScreen('detail') }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function GoalCard({ goal, onClick }: { goal: GoalWithTasks; onClick: () => void }) {
  return (
    <Card onClick={onClick} className="p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-zinc-900 truncate">{goal.title}</h3>
          {goal.description && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{goal.description}</p>}
        </div>
        <span className="text-zinc-300 shrink-0">{icons.chevRight}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span className="font-mono">{goal.tasks.length} {goal.tasks.length === 1 ? 'task' : 'tasks'}</span>
        <span className="flex items-center gap-1">{icons.clock} Due {fmtDate(goal.deadline)}</span>
      </div>
    </Card>
  )
}

function GoalDetail({
  goal, setScreen, onTasksChanged, api,
}: {
  goal: GoalWithTasks
  setScreen: (s: Screen) => void
  onTasksChanged: (tasks: Task[]) => void
  api: ApiClient
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  async function generate() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      let tasks: Task[]
      try {
        tasks = await api.generateTasks(goal.id)
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.code !== 'TASKS_ALREADY_GENERATED') throw cause
        tasks = await api.getTasks(goal.id)
      }
      onTasksChanged(tasks)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate tasks.')
    } finally {
      setBusy(false)
      busyRef.current = false
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <button onClick={() => setScreen('dashboard')} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-6 cursor-pointer">
        {icons.chevLeft} Back to goals
      </button>
      <div className="flex items-start justify-between gap-5 mb-6">
        <div>
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">Personal goal</p>
          <h1 className="text-2xl font-semibold text-zinc-900">{goal.title}</h1>
          <p className="text-sm text-zinc-500 mt-2">Due {fmtDate(goal.deadline)}</p>
        </div>
        {goal.tasks.length === 0 && (
          <Btn onClick={generate} disabled={busy} size="md">{icons.sparkles} {busy ? 'Generating…' : 'Generate tasks'}</Btn>
        )}
      </div>

      {goal.description && <Card className="p-5 mb-6"><p className="text-sm text-zinc-700 whitespace-pre-wrap">{goal.description}</p></Card>}
      {error && <p role="alert" className="mb-5 text-sm text-red-700">{error}</p>}
      <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider mb-4">Tasks</h2>
      {busy && <p role="status" className="mb-4 text-sm text-zinc-500">Generating tasks…</p>}
      {goal.tasks.length === 0 && !busy ? (
        <Card className="p-6 text-sm text-zinc-500">No tasks saved for this goal yet. Generate a plan to get started.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {goal.tasks.map(task => (
            <Card key={task.id} className="p-5">
              <div className="flex gap-3">
                <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-xs flex items-center justify-center font-mono shrink-0">{task.display_order}</span>
                <div>
                  <h3 className="font-semibold text-zinc-900">{task.title}</h3>
                  <p className="text-sm text-zinc-500 mt-1 whitespace-pre-wrap">{task.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Create Wager ─────────────────────────────────────────────────────────────

function CreateWager({
  setScreen, onGoalSaved, onOpenGoal, api,
}: {
  setScreen: (s: Screen) => void
  onGoalSaved: (goal: Goal) => void
  onOpenGoal: (goal: Goal, tasks: Task[]) => void
  api: ApiClient
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [goal, setGoal] = useState<Goal | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [taskMode, setTaskMode] = useState<'ai' | 'manual'>('ai')
  const [manualTasks, setManualTasks] = useState<ManualTaskDraft[]>([
    { id: genId(), title: '', description: '' },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  async function generateForGoal(savedGoal: Goal) {
    if (busyRef.current) return
    busyRef.current = true
    setError(null)
    setBusy(true)
    try {
      try {
        setTasks(await api.generateTasks(savedGoal.id))
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.code !== 'TASKS_ALREADY_GENERATED') throw cause
        setTasks(await api.getTasks(savedGoal.id))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate tasks.')
    } finally {
      setBusy(false)
      busyRef.current = false
    }
  }

  async function saveAndGenerate() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const savedGoal = await api.createGoal({
        title: title.trim(),
        description: description.trim(),
        deadline,
      })
      setGoal(savedGoal)
      onGoalSaved(savedGoal)
      setStep(2)
      try {
        setTasks(await api.generateTasks(savedGoal.id))
      } catch (cause) {
        if (cause instanceof ApiError && cause.code === 'TASKS_ALREADY_GENERATED') {
          setTasks(await api.getTasks(savedGoal.id))
        } else {
          setError(cause instanceof Error ? cause.message : 'Could not generate tasks.')
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your goal.')
    } finally {
      setBusy(false)
      busyRef.current = false
    }
  }

  function switchToManual() {
    setTaskMode('manual')
    setError(null)
  }

  function updateManualTask(id: string, field: 'title' | 'description', value: string) {
    setManualTasks(current => current.map(task => task.id === id ? { ...task, [field]: value } : task))
  }

  function addManualTask() {
    if (manualTasks.length < 7) {
      setManualTasks(current => [...current, { id: genId(), title: '', description: '' }])
    }
  }

  function removeManualTask(id: string) {
    if (manualTasks.length > 1) setManualTasks(current => current.filter(task => task.id !== id))
  }

  async function saveManualTasks() {
    if (!goal || busyRef.current) return
    const input = manualTasks.map(({ title: taskTitle, description: taskDescription }) => ({
      title: taskTitle.trim(),
      description: taskDescription.trim(),
    }))
    if (input.some(task => !task.title || !task.description || task.title.length > 120 || task.description.length > 1000)) {
      setError('Each task needs a title and description within the character limits.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const savedTasks = await api.createManualTasks(goal.id, input)
      onOpenGoal(goal, savedTasks)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save tasks.')
    } finally {
      setBusy(false)
      busyRef.current = false
    }
  }

  const today = new Date()
  const minDeadline = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-zinc-100 px-8 py-5 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setScreen('dashboard')} className="text-zinc-400 hover:text-zinc-700 p-1 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer">
              {icons.chevLeft}
            </button>
            <div>
              <p className="text-xs font-mono text-zinc-400">Step {step} of 2</p>
              <p className="text-sm font-semibold text-zinc-900">{step === 1 ? 'Define your goal' : 'Your task plan'}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {[1, 2].map(item => <div key={item} className={cn('h-1.5 rounded-full transition-all', item <= step ? 'w-8 bg-zinc-900' : 'w-4 bg-zinc-200')} />)}
          </div>
        </div>
      </div>

      <div className="flex-1 px-8 py-8">
        <div className="max-w-2xl mx-auto">
          {step === 1 ? (
            <div>
              <h2 className="text-xl font-semibold text-zinc-900 mb-1">What's your goal?</h2>
              <p className="text-zinc-500 text-sm mb-6">Set a clear outcome and a deadline. Wagerly will save your goal before generating its task plan.</p>
              <div className="flex flex-col gap-5">
                <div>
                  <Label>Goal</Label>
                  <Input value={title} onChange={setTitle} placeholder="e.g. Launch my app to 100 users" />
                  <p className="text-xs text-zinc-400 mt-1.5">Up to 120 characters.</p>
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <textarea
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    maxLength={2000}
                    rows={4}
                    placeholder="Add context that will help create useful tasks."
                    className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 resize-none bg-white"
                  />
                </div>
                <div>
                  <Label>Deadline</Label>
                  <Input type="date" value={deadline} onChange={setDeadline} className="w-full" />
                  <p className="text-xs text-zinc-400 mt-1.5">The date is saved as a calendar date, without shifting across time zones.</p>
                </div>
                {title && deadline && (
                  <Card className="p-4 border-indigo-100 bg-indigo-50/40">
                    <p className="text-xs font-mono text-indigo-400 uppercase tracking-wider mb-1">Preview</p>
                    <p className="text-zinc-900 font-medium">{title}</p>
                    <p className="text-zinc-500 text-sm mt-1">Due {fmtDate(deadline)}</p>
                  </Card>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900 mb-1">Your next steps</h2>
                  <p className="text-zinc-500 text-sm">{goal?.title}</p>
                </div>
                {tasks.length === 0 && (
                  <Btn variant="secondary" onClick={() => goal && generateForGoal(goal)} disabled={busy}>
                    {icons.sparkles} {busy ? 'Generating…' : 'Retry generation'}
                  </Btn>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-zinc-100 mb-6">
                <button
                  type="button"
                  onClick={() => setTaskMode('ai')}
                  className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer', taskMode === 'ai' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500')}
                >
                  {icons.sparkles} Generate with AI
                </button>
                <button
                  type="button"
                  onClick={switchToManual}
                  className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer', taskMode === 'manual' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500')}
                >
                  Enter Manually
                </button>
              </div>
              {taskMode === 'manual' ? (
                <div className="flex flex-col gap-3">
                  {manualTasks.map((task, index) => (
                    <Card key={task.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-xs flex items-center justify-center font-mono shrink-0">{index + 1}</span>
                        <div className="flex-1 flex flex-col gap-2">
                          <input
                            value={task.title}
                            maxLength={120}
                            onChange={event => updateManualTask(task.id, 'title', event.target.value)}
                            placeholder="Task title"
                            aria-label={`Task ${index + 1} title`}
                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                          />
                          <textarea
                            value={task.description}
                            maxLength={1000}
                            onChange={event => updateManualTask(task.id, 'description', event.target.value)}
                            placeholder="Describe what completing this step means"
                            aria-label={`Task ${index + 1} description`}
                            rows={3}
                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 resize-none"
                          />
                        </div>
                        <button type="button" onClick={() => removeManualTask(task.id)} disabled={manualTasks.length === 1} aria-label={`Delete task ${index + 1}`} className="p-2 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed">{icons.trash}</button>
                      </div>
                    </Card>
                  ))}
                  {manualTasks.length < 7 && (
                    <button type="button" onClick={addManualTask} className="self-start flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 py-2 px-3 rounded-xl hover:bg-zinc-100 cursor-pointer">
                      {icons.plus} Add Step
                    </button>
                  )}
                </div>
              ) : (
                <>
              {busy && <p role="status" className="text-sm text-zinc-500">Generating tasks for your goal…</p>}
              {error && !busy && (
                <Btn variant="secondary" onClick={switchToManual}>Switch to manual task entry</Btn>
              )}
              {!busy && tasks.length === 0 && !error && (
                <Card className="p-6 text-sm text-zinc-500">No tasks have been generated yet. You can retry without creating another goal.</Card>
              )}
              {tasks.length > 0 && (
                <div className="flex flex-col gap-3">
                  {tasks.map(task => (
                    <Card key={task.id} className="p-5">
                      <div className="flex gap-3">
                        <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-xs flex items-center justify-center font-mono shrink-0">{task.display_order}</span>
                        <div>
                          <h3 className="font-semibold text-zinc-900">{task.title}</h3>
                          <p className="text-sm text-zinc-500 mt-1">{task.description}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
                </>
              )}
            </div>
          )}
          {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
        </div>
      </div>

      <div className="bg-white border-t border-zinc-100 px-8 py-4 sticky bottom-0">
        <div className="max-w-2xl mx-auto flex justify-between gap-3">
          <Btn variant="secondary" onClick={() => setScreen('dashboard')}>Back to goals</Btn>
          {step === 1 ? (
            <Btn onClick={saveAndGenerate} disabled={title.trim().length < 1 || title.trim().length > 120 || !deadline || deadline < minDeadline || busy} size="lg">
              {busy ? 'Saving goal…' : 'Save goal & generate tasks'} {icons.arrowRight}
            </Btn>
          ) : (
            <Btn onClick={taskMode === 'manual' ? saveManualTasks : () => goal && onOpenGoal(goal, tasks)} disabled={taskMode === 'manual' ? busy : tasks.length === 0 || busy} size="lg">
              {taskMode === 'manual' ? (busy ? 'Saving tasks…' : 'Save Tasks') : 'View saved goal'} {icons.arrowRight}
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-zinc-700 mb-1.5">{children}</label>
}

function Input({ value, onChange, placeholder, type = 'text', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn('w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition-all bg-white', className)}
    />
  )
}

function StepGoal({ form, patch }: { form: CreateState; patch: (p: Partial<CreateState>) => void }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-900 mb-1">What's your commitment?</h2>
      <p className="text-zinc-500 text-sm mb-6">Be specific. Clear goals are easier to verify.</p>

      <div className="flex flex-col gap-5">
        <div>
          <Label>Goal</Label>
          <Input
            value={form.goal}
            onChange={v => patch({ goal: v })}
            placeholder="e.g. Launch my app to 100 users by Q4"
          />
          <p className="text-xs text-zinc-400 mt-1.5">Start with a verb. Describe the outcome, not the effort.</p>
        </div>
        <div>
          <Label>Deadline</Label>
          <Input type="date" value={form.deadline} onChange={v => patch({ deadline: v })} />
          <p className="text-xs text-zinc-400 mt-1.5">Give yourself enough time to succeed, but not so much that urgency disappears.</p>
        </div>
        {form.goal && form.deadline && (
          <Card className="p-4 border-indigo-100 bg-indigo-50/40">
            <p className="text-xs font-mono text-indigo-400 uppercase tracking-wider mb-1">Preview</p>
            <p className="text-zinc-900 font-medium">"{form.goal}"</p>
            <p className="text-zinc-500 text-sm mt-1">Due {fmtDate(form.deadline)}</p>
          </Card>
        )}
      </div>
    </div>
  )
}

function StepPlan({ form, patch, aiLoading, planError, generateAI }: {
  form: CreateState; patch: (p: Partial<CreateState>) => void; aiLoading: boolean; planError: string | null; generateAI: () => void
}) {
  function addMilestone() {
    patch({
      milestones: [...form.milestones, {
        id: genId(), title: '', dueDate: '', completed: false, verified: false, pendingVerification: false,
      }]
    })
  }

  function updateMilestone(id: string, field: keyof Milestone, value: string | boolean) {
    patch({ milestones: form.milestones.map(m => m.id === id ? { ...m, [field]: value } : m) })
  }

  function removeMilestone(id: string) {
    patch({ milestones: form.milestones.filter(m => m.id !== id) })
  }

  function moveMilestone(id: string, dir: -1 | 1) {
    const arr = [...form.milestones]
    const idx = arr.findIndex(m => m.id === id)
    const target = idx + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
    patch({ milestones: arr })
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-900 mb-1">Break it into milestones</h2>
      <p className="text-zinc-500 text-sm mb-6">Milestones give your partner clear checkpoints to verify.</p>

      {!form.planMode && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={generateAI}
            className="p-5 rounded-2xl border-2 border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-left transition-all cursor-pointer group"
          >
            <div className="text-indigo-500 mb-3">{icons.sparkles}</div>
            <p className="font-semibold text-zinc-900 mb-1">Build with AI</p>
            <p className="text-xs text-zinc-500">Generate a smart milestone plan based on your goal and deadline.</p>
          </button>
          <button
            onClick={() => patch({ planMode: 'manual' })}
            className="p-5 rounded-2xl border-2 border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 text-left transition-all cursor-pointer"
          >
            <div className="text-zinc-400 mb-3 text-lg font-mono">✎</div>
            <p className="font-semibold text-zinc-900 mb-1">Build Manually</p>
            <p className="text-xs text-zinc-500">Write your own milestones from scratch, full control.</p>
          </button>
        </div>
      )}

      {planError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{planError}</p>}

      {aiLoading && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-500">Generating your milestone plan…</p>
        </div>
      )}

      {!aiLoading && form.milestones.length > 0 && (
        <div className="flex flex-col gap-3 mb-4">
          {form.milestones.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400 w-5 shrink-0 text-center">{i + 1}</span>
              <div className="flex-1 flex gap-2">
                <input
                  value={m.title}
                  onChange={e => updateMilestone(m.id, 'title', e.target.value)}
                  placeholder="Milestone description"
                  className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 bg-white"
                />
                <input
                  type="date"
                  value={m.dueDate}
                  onChange={e => updateMilestone(m.id, 'dueDate', e.target.value)}
                  className="w-36 px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-700 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 bg-white"
                />
              </div>
              <div className="flex gap-1">
                <button onClick={() => moveMilestone(m.id, -1)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 disabled:opacity-20 cursor-pointer">{icons.chevUp}</button>
                <button onClick={() => moveMilestone(m.id, 1)} disabled={i === form.milestones.length - 1} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 disabled:opacity-20 cursor-pointer">{icons.chevDown}</button>
                <button onClick={() => removeMilestone(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 cursor-pointer">{icons.trash}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(form.planMode || form.milestones.length > 0) && !aiLoading && (
        <button
          onClick={addMilestone}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 py-2 px-3 rounded-xl hover:bg-zinc-100 transition-colors cursor-pointer"
        >
          {icons.plus} Add milestone
        </button>
      )}
    </div>
  )
}

function StepStakes({ form, patch }: { form: CreateState; patch: (p: Partial<CreateState>) => void }) {
  const presets = [25, 50, 100, 200, 500]
  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-900 mb-1">Choose your stake</h2>
      <p className="text-zinc-500 text-sm mb-2">Stakes create real accountability. Wagerly uses virtual stakes — no money changes hands.</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 mb-6">
        Virtual stakes are commitment tools. They are saved with this goal and shared for accountability — no money is charged or transferred.
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => patch({ stakeType: 'financial' })}
          className={cn(
            'p-5 rounded-2xl border-2 text-left transition-all cursor-pointer',
            form.stakeType === 'financial' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:border-zinc-400'
          )}
        >
          <p className="text-2xl font-mono mb-2">$</p>
          <p className="font-semibold mb-1">Financial</p>
          <p className={cn('text-xs', form.stakeType === 'financial' ? 'text-zinc-400' : 'text-zinc-500')}>Set a virtual dollar amount you're putting on the line.</p>
        </button>
        <button
          onClick={() => patch({ stakeType: 'custom' })}
          className={cn(
            'p-5 rounded-2xl border-2 text-left transition-all cursor-pointer',
            form.stakeType === 'custom' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 hover:border-zinc-400'
          )}
        >
          <p className="text-2xl mb-2">📋</p>
          <p className="font-semibold mb-1">Custom Consequence</p>
          <p className={cn('text-xs', form.stakeType === 'custom' ? 'text-zinc-400' : 'text-zinc-500')}>Define your own consequence if you don't follow through.</p>
        </button>
      </div>

      {form.stakeType === 'financial' && (
        <div>
          <Label>Virtual stake amount</Label>
          <div className="flex gap-2 mb-3 flex-wrap">
            {presets.map(p => (
              <button
                key={p}
                onClick={() => patch({ stakeAmount: String(p) })}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-mono font-medium border transition-all cursor-pointer',
                  form.stakeAmount === String(p) ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-400'
                )}
              >
                ${p}
              </button>
            ))}
          </div>
          <Input
            value={form.stakeAmount}
            onChange={v => patch({ stakeAmount: v })}
            placeholder="Or enter custom amount"
            type="number"
          />
        </div>
      )}

      {form.stakeType === 'custom' && (
        <div>
          <Label>Consequence if you miss the deadline</Label>
          <textarea
            value={form.stakeDescription}
            onChange={e => patch({ stakeDescription: e.target.value })}
            placeholder="e.g. Cook dinner every night for two weeks, donate $50 to a cause I dislike, give up coffee for a month…"
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 resize-none bg-white"
          />
          <p className="text-xs text-zinc-400 mt-1.5">Make it meaningful enough to motivate you, but not punishing.</p>
        </div>
      )}
    </div>
  )
}

function StepPartner({ form, patch }: { form: CreateState; patch: (p: Partial<CreateState>) => void }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-900 mb-1">Invite your accountability partner</h2>
      <p className="text-zinc-500 text-sm mb-6">Your partner verifies milestone completions. Choose someone you trust to be honest.</p>

      <div className="flex flex-col gap-5">
        <div>
          <Label>Partner's name</Label>
          <Input value={form.partnerName} onChange={v => patch({ partnerName: v })} placeholder="Full name" />
        </div>
        <div>
          <Label>Username or email</Label>
          <Input value={form.partnerHandle} onChange={v => patch({ partnerHandle: v })} placeholder="@username or email@example.com" />
          <p className="text-xs text-zinc-400 mt-1.5">Invitation delivery will be available when a backend is connected.</p>
        </div>

        {form.partnerName === '' && (
          <p className="text-xs text-zinc-400">Enter a name and a username or email address to identify your accountability partner.</p>
        )}

        {form.partnerName && (
          <Card className="p-4 border-emerald-100 bg-emerald-50/40">
            <div className="flex items-center gap-3">
              <Avatar initials={form.partnerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()} color="emerald" />
              <div>
                <p className="font-medium text-zinc-900">{form.partnerName}</p>
                <p className="text-xs text-zinc-500 font-mono">{form.partnerHandle || 'Invite pending'}</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function StepReview({ form }: { form: CreateState }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-900 mb-1">Review your commitment</h2>
      <p className="text-zinc-500 text-sm mb-6">Once you commit, your partner receives an invitation and the clock starts.</p>

      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">Goal & Deadline</p>
          <p className="font-semibold text-zinc-900 text-lg mb-1">{form.goal}</p>
          <p className="text-zinc-500 text-sm">Due {fmtDate(form.deadline)}</p>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">{form.milestones.length} Milestones</p>
          <div className="flex flex-col gap-2">
            {form.milestones.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-xs flex items-center justify-center font-mono shrink-0">{i + 1}</span>
                <span className="text-zinc-700 flex-1">{m.title}</span>
                {m.dueDate && <span className="text-zinc-400 font-mono text-xs">{fmtDate(m.dueDate)}</span>}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">Stake</p>
          {form.stakeType === 'financial' ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-mono font-semibold text-zinc-900">${form.stakeAmount}</span>
              <span className="text-zinc-500 text-sm">virtual stake on the line</span>
            </div>
          ) : (
            <p className="text-zinc-700">{form.stakeDescription}</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-3">Accountability Partner</p>
          <div className="flex items-center gap-3">
            <Avatar
              initials={form.partnerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              color="indigo"
            />
            <div>
              <p className="font-medium text-zinc-900">{form.partnerName}</p>
              <p className="text-xs text-zinc-500 font-mono">{form.partnerHandle}</p>
            </div>
          </div>
        </Card>

        <p className="text-xs text-zinc-400 text-center px-4">
          By committing, you agree to complete this goal and allow your partner to verify your progress. Wagerly does not hold or transfer any funds.
        </p>
      </div>
    </div>
  )
}

// ─── Active Wager ─────────────────────────────────────────────────────────────

function ActiveWager({
  wager, setScreen, updateWager,
}: {
  wager: Wager; setScreen: (s: Screen) => void; updateWager: (w: Wager) => Promise<void>
}) {
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function markComplete(id: string) {
    const updated = {
      ...wager,
      milestones: wager.milestones.map(m =>
        m.id === id ? { ...m, completed: true, pendingVerification: true } : m
      ),
    }
    try {
      await updateWager(updated)
      showToast('Milestone submitted for partner verification')
    } catch {
      return
    }
  }

  const completedCount = wager.milestones.filter(m => m.completed).length
  const verifiedCount = wager.milestones.filter(m => m.verified).length
  const pendingVerify = wager.milestones.find(m => m.pendingVerification && !m.verified)

  return (
    <div className="p-8 max-w-3xl relative">
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-zinc-900 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in">
          <span className="text-emerald-400">{icons.check}</span> {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setScreen('dashboard')} className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer">
          {icons.chevLeft}
        </button>
        <p className="text-zinc-400 text-sm">Active Wager</p>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Badge status={wager.status} />
          <h1 className="text-2xl font-semibold text-zinc-900 mt-2 mb-1">{wager.goal}</h1>
          <p className="text-zinc-500 text-sm">Due {fmtDate(wager.deadline)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-4xl font-semibold text-zinc-900 font-mono">{daysUntil(wager.deadline)}</p>
          <p className="text-xs text-zinc-400 font-mono">days left</p>
        </div>
      </div>

      {/* Progress */}
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-zinc-700">Overall Progress</p>
          <p className="text-sm font-mono font-semibold text-zinc-900">{wager.progress}%</p>
        </div>
        <ProgressBar value={wager.progress} className="h-2.5" />
        <p className="text-xs text-zinc-400 mt-2 font-mono">{verifiedCount} of {wager.milestones.length} milestones verified</p>
      </Card>

      {/* Stake + Partner */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">Stake</p>
          {wager.stake.type === 'financial' ? (
            <>
              <p className="text-2xl font-mono font-semibold text-zinc-900">${wager.stake.amount}</p>
              <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">{icons.shield} virtual stake protected</p>
            </>
          ) : (
            <p className="text-sm text-zinc-700">{wager.stake.description}</p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">Partner</p>
          <div className="flex items-center gap-2">
            <Avatar initials={wager.partner.initials} color={wager.partner.color} />
            <div>
              <p className="font-medium text-zinc-900 text-sm">{wager.partner.name}</p>
              <p className="text-xs text-zinc-400 font-mono">{wager.partner.handle}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Completion shortcut */}
      {wager.status === 'completed' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-900">Goal completed and verified!</p>
            <p className="text-xs text-emerald-700 mt-0.5">Your partner confirmed every milestone.</p>
          </div>
          <Btn variant="success" size="sm" onClick={() => setScreen('completion')}>
            View Achievement
          </Btn>
        </div>
      )}

      {/* Partner action */}
      {pendingVerify && wager.status !== 'completed' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-900">Awaiting partner verification</p>
            <p className="text-xs text-amber-700 mt-0.5">"{pendingVerify.title}" is pending review by {wager.partner.name.split(' ')[0]}</p>
          </div>
          <Btn variant="secondary" size="sm" onClick={() => setScreen('verify')}>
            View as Partner
          </Btn>
        </div>
      )}

      {/* Milestones */}
      <div>
        <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider mb-4">Milestone Timeline</h2>
        <div className="relative">
          {wager.milestones.map((m, i) => {
            const isLast = i === wager.milestones.length - 1
            return (
              <div key={m.id} className="flex gap-4">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white',
                    m.verified ? 'bg-emerald-500' : m.pendingVerification ? 'bg-amber-400' : m.completed ? 'bg-emerald-300' : 'bg-zinc-200'
                  )}>
                    {m.verified ? icons.check : m.pendingVerification ? icons.clock : <span className="text-zinc-400 text-xs font-mono">{i + 1}</span>}
                  </div>
                  {!isLast && <div className={cn('w-0.5 flex-1 mt-1 mb-1', m.verified ? 'bg-emerald-200' : 'bg-zinc-100')} style={{ minHeight: '24px' }} />}
                </div>

                {/* Milestone content */}
                <div className={cn('flex-1 pb-5', isLast && 'pb-0')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className={cn('font-medium text-sm', m.verified ? 'text-zinc-900' : m.pendingVerification ? 'text-amber-700' : 'text-zinc-700')}>
                        {m.title}
                      </p>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5 flex items-center gap-1">
                        {icons.clock} {fmtDate(m.dueDate)}
                      </p>
                      {m.verified && <p className="text-xs text-emerald-600 mt-0.5 font-medium">✓ Partner verified</p>}
                      {m.pendingVerification && !m.verified && <p className="text-xs text-amber-600 mt-0.5">Awaiting verification…</p>}
                    </div>
                    {!m.completed && !m.pendingVerification && (
                      <Btn variant="secondary" size="sm" onClick={() => markComplete(m.id)}>
                        {icons.check} Mark Done
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Partner Verification ─────────────────────────────────────────────────────

function PartnerVerify({
  wager, setScreen, updateWager,
}: {
  wager: Wager; setScreen: (s: Screen) => void; updateWager: (w: Wager) => Promise<void>
}) {
  const pending = wager.milestones.find(m => m.pendingVerification && !m.verified)
  const [decision, setDecision] = useState<'verified' | 'requested' | null>(null)

  async function verify() {
    const updated = {
      ...wager,
      milestones: wager.milestones.map(m =>
        m.id === pending?.id ? { ...m, verified: true, pendingVerification: false } : m
      ),
    }
    const allVerified = updated.milestones.every(m => m.verified)
    updated.progress = calcProgress(updated.milestones)
    if (allVerified) updated.status = 'completed'
    try {
      await updateWager(updated)
    } catch {
      return
    }
    setDecision('verified')
    if (allVerified) setTimeout(() => setScreen('completion'), 1200)
    else setTimeout(() => setScreen('active'), 1200)
  }

  async function requestMore() {
    const updated = {
      ...wager,
      milestones: wager.milestones.map(m =>
        m.id === pending?.id ? { ...m, pendingVerification: false, completed: false } : m
      ),
    }
    try {
      await updateWager(updated)
    } catch {
      return
    }
    setDecision('requested')
    setTimeout(() => setScreen('active'), 1200)
  }

  if (!pending) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="text-center py-20">
          <p className="text-zinc-400">No milestones pending verification.</p>
          <Btn variant="ghost" onClick={() => setScreen('active')} className="mt-4">Back</Btn>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => setScreen('active')} className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer">
          {icons.chevLeft}
        </button>
        <div>
          <p className="text-xs font-mono text-zinc-400">Partner View</p>
          <p className="text-sm font-semibold text-zinc-900">Milestone Verification</p>
        </div>
      </div>

      {/* Context */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-6 flex items-center gap-3">
        <Avatar initials={wager.partner.initials} color="indigo" />
        <div>
          <p className="text-sm font-medium text-indigo-900">Verifying on behalf of {wager.partner.name}</p>
          <p className="text-xs text-indigo-600 font-mono">{wager.partner.handle}</p>
        </div>
      </div>

      <Card className="p-6 mb-4">
        <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1">Goal</p>
        <p className="font-medium text-zinc-900 mb-4">{wager.goal}</p>
        <div className="h-px bg-zinc-100 mb-4" />
        <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">Milestone to Verify</p>
        <p className="font-semibold text-zinc-900 text-lg mb-2">{pending.title}</p>
        <p className="text-xs text-zinc-400 font-mono flex items-center gap-1">{icons.clock} Due {fmtDate(pending.dueDate)}</p>
      </Card>

      <Card className="p-5 mb-6">
        <p className="text-xs font-mono text-zinc-400 uppercase tracking-wider mb-2">Evidence submitted</p>
        <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
          <p className="text-sm text-zinc-600 leading-relaxed">
            "I've completed this milestone as planned. The work has been delivered, tested, and is ready for your review.
            Screenshot and supporting documentation have been uploaded to our shared folder."
          </p>
          <p className="text-xs text-zinc-400 font-mono mt-2">Submitted Oct 15, 2026 at 2:34 PM</p>
        </div>
      </Card>

      {decision === null ? (
        <div className="flex gap-3">
          <Btn variant="success" onClick={verify} fullWidth size="lg">
            {icons.check} Verify Completion
          </Btn>
          <Btn variant="secondary" onClick={requestMore} fullWidth size="lg">
            Request More Info
          </Btn>
        </div>
      ) : (
        <div className={cn(
          'text-center py-6 rounded-2xl',
          decision === 'verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        )}>
          <p className="font-semibold">
            {decision === 'verified' ? '✓ Milestone verified!' : 'More information requested.'}
          </p>
          <p className="text-sm mt-1 opacity-75">Redirecting…</p>
        </div>
      )}
    </div>
  )
}

// ─── Completion ───────────────────────────────────────────────────────────────

function CompletionScreen({ wager, setScreen }: { wager: Wager; setScreen: (s: Screen) => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        {/* Trophy */}
        <div className="w-20 h-20 bg-amber-400 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-100">
          <span className="text-white scale-150">{icons.trophy}</span>
        </div>

        <h1 className="text-3xl font-semibold text-zinc-900 mb-2">You did it!</h1>
        <p className="text-zinc-500 mb-8">Every milestone completed and verified. Your commitment paid off.</p>

        {/* Progress */}
        <Card className="p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-zinc-700">Goal Completed</p>
            <span className="text-emerald-600 font-mono font-semibold text-sm">100%</span>
          </div>
          <ProgressBar value={100} />
          <p className="text-sm text-zinc-500 mt-3 font-medium">{wager.goal}</p>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="p-4">
            <p className="text-2xl font-mono font-semibold text-zinc-900">{wager.milestones.length}</p>
            <p className="text-xs text-zinc-400 mt-1">milestones</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="text-xs font-mono text-emerald-600">{icons.shield}</span>
            </div>
            {wager.stake.type === 'financial' ? (
              <>
                <p className="text-xl font-mono font-semibold text-emerald-700">${wager.stake.amount}</p>
                <p className="text-xs text-zinc-400 mt-1">stake protected</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-emerald-700">Safe</p>
                <p className="text-xs text-zinc-400 mt-1">consequence avoided</p>
              </>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-mono font-semibold text-zinc-900">✓</p>
            <p className="text-xs text-zinc-400 mt-1">on time</p>
          </Card>
        </div>

        {/* Partner verification */}
        <Card className="p-4 mb-8 border-emerald-100 bg-emerald-50/40">
          <div className="flex items-center gap-3">
            <Avatar initials={wager.partner.initials} color="emerald" />
            <div className="text-left">
              <p className="text-sm font-medium text-zinc-900">{wager.partner.name} verified your completion</p>
              <p className="text-xs text-zinc-500 font-mono">{wager.partner.handle} · Partner verification</p>
            </div>
            <span className="ml-auto text-emerald-500">{icons.check}</span>
          </div>
        </Card>

        <div className="flex gap-3">
          <Btn variant="secondary" fullWidth>Share Achievement</Btn>
          <Btn onClick={() => setScreen('dashboard')} fullWidth>Back to Dashboard {icons.arrowRight}</Btn>
        </div>
      </div>
    </div>
  )
}

// ─── History ──────────────────────────────────────────────────────────────────

function HistoryScreen({ goals, setSelectedId, setScreen }: {
  goals: GoalWithTasks[]
  setSelectedId: (id: string) => void
  setScreen: (s: Screen) => void
}) {
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 mb-6">Goal history</h1>
      {goals.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-zinc-400">No saved goals yet.</p></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map(goal => (
            <Card key={goal.id} onClick={() => { setSelectedId(goal.id); setScreen('detail') }} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-zinc-900">{goal.title}</p>
                  <p className="text-xs text-zinc-400 font-mono mt-1">Created {fmtDate(goal.created_at)} · Due {fmtDate(goal.deadline)}</p>
                </div>
                <span className="text-xs text-zinc-500 font-mono">{goal.tasks.length} tasks</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function LegacyHistoryScreen({ wagers, setScreen }: { wagers: Wager[]; setScreen: (s: Screen) => void }) {
  const completed = wagers.filter(w => w.status === 'completed')
  const missed = wagers.filter(w => w.status === 'missed')
  const all = [...completed, ...missed]
  const partners = [...new Map(wagers.map(w => [w.partner.handle, w.partner])).values()]

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">History</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total commitments" value={String(wagers.length)} />
        <StatCard label="Completed" value={String(completed.length)} accent="text-emerald-700" />
        <StatCard label="Missed" value={String(missed.length)} accent="text-red-600" />
        <StatCard label="Accountability partners" value={String(partners.length)} sub="connected to your goals" />
      </div>

      {/* Partner stats */}
      <div className="mb-8">
        <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider mb-4">Partners</h2>
        {partners.length === 0 ? (
          <Card className="p-5 text-sm text-zinc-400">Partners you add to a goal will appear here.</Card>
        ) : (
          <div className="flex gap-3 flex-wrap">
            {partners.map(p => (
              <Card key={p.handle} className="p-4 flex items-center gap-3 min-w-[180px]">
                <Avatar initials={p.initials} color={p.color} />
                <div>
                  <p className="font-medium text-zinc-900 text-sm">{p.name}</p>
                  <p className="text-xs text-zinc-400 font-mono">{p.handle}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Past wagers */}
      <div>
        <h2 className="text-sm font-mono text-zinc-400 uppercase tracking-wider mb-4">Past Wagers</h2>
        {all.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-zinc-400">No completed wagers yet.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {all.map(w => (
              <Card key={w.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-semibold text-zinc-900 mb-1">{w.goal}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono">
                      <span>{fmtDate(w.createdAt)} → {fmtDate(w.deadline)}</span>
                      <span>{w.milestones.length} milestones</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {w.stake.type === 'financial' && (
                      <span className="font-mono text-sm text-zinc-600">${w.stake.amount}</span>
                    )}
                    <Badge status={w.status} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Landing & Login ──────────────────────────────────────────────────────────

function LandingLogin({
  onLogin, onRegister, onErrorClear, error, message, loading,
}: {
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (email: string, password: string) => Promise<void>
  onErrorClear: () => void
  error: string | null
  message: string | null
  loading: boolean
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (isRegistering) void onRegister(email.trim(), password)
    else void onLogin(email.trim(), password)
  }

  return (
    <div className="min-h-screen bg-[#e5f6ff] text-[#161514] overflow-hidden">
      <header className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#d42295] text-[#e5f6ff] flex items-center justify-center font-extrabold text-lg shadow-[4px_4px_0_#161514]">W</div>
          <span className="font-extrabold text-xl tracking-tight">Wagerly</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-sm font-semibold">
          <span className="px-3 py-1.5 rounded-full border border-[#161514]">Personal goals</span>
          <span className="px-3 py-1.5 rounded-full bg-[#90cf8a] border border-[#161514]">AI task plans</span>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-8 pb-16 lg:pt-16">
        <div className="absolute w-72 h-72 rounded-full bg-[#f46b16] -top-32 -right-32 opacity-70" />
        <div className="absolute w-56 h-56 rounded-full bg-[#90cf8a] bottom-0 left-1/3 opacity-80" />

        <div className="relative grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-20 items-center">
          <section>
            <div className="inline-flex items-center gap-2 bg-[#90cf8a] border border-[#161514] rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider mb-7">
              <span className="w-2 h-2 rounded-full bg-[#161514]" />
              Accountability that actually sticks
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[0.98] tracking-[-0.045em] max-w-3xl">
              Make a promise.
              <span className="block text-[#d42295]">Follow through.</span>
            </h1>
            <p className="mt-7 text-lg sm:text-xl leading-relaxed max-w-xl font-medium">
              Turn ambitious goals into clear plans with AI-generated next steps and deadlines that keep you moving.
            </p>

            <div className="mt-9 grid sm:grid-cols-3 gap-3 max-w-2xl">
              {[
                ['01', 'Commit', 'Set a clear goal'],
                ['02', 'Plan', 'Break it into tasks'],
                ['03', 'Follow through', 'Work through your plan'],
              ].map(([number, title, copy], index) => (
                <div
                  key={title}
                  className={cn(
                    'rounded-2xl border border-[#161514] p-4 shadow-[4px_4px_0_#161514]',
                    index === 0 ? 'bg-[#d42295] text-[#e5f6ff]' : index === 1 ? 'bg-[#90cf8a]' : 'bg-[#f46b16]'
                  )}
                >
                  <p className="text-xs font-bold opacity-70">{number}</p>
                  <p className="font-extrabold mt-4">{title}</p>
                  <p className="text-xs font-semibold mt-1">{copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <div className="absolute -inset-4 bg-[#d42295] rounded-[2rem] rotate-3 border-2 border-[#161514]" />
            <div className="relative bg-[#90cf8a] border-2 border-[#161514] rounded-[2rem] p-6 sm:p-8 shadow-[8px_8px_0_#161514]">
              <div className="mb-8">
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] mb-2">{isRegistering ? 'Start your journey' : 'Welcome back'}</p>
                <h2 className="text-3xl font-extrabold tracking-tight">{isRegistering ? 'Create your account' : 'Sign in to your goals'}</h2>
                <p className="text-sm font-medium mt-2">{isRegistering ? 'Create an account to save your goals.' : 'Your next milestone is waiting.'}</p>
              </div>

              {error && <p role="alert" className="mb-5 rounded-xl border-2 border-red-800 bg-red-100 px-4 py-3 text-sm font-semibold text-red-900">{error}</p>}
              {message && <p role="status" className="mb-5 rounded-xl border-2 border-[#161514] bg-[#e5f6ff] px-4 py-3 text-sm font-semibold">{message}</p>}
              <form onSubmit={submit} className="flex flex-col gap-5">
                <div>
                  <label className="block text-sm font-bold mb-2" htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={event => { setEmail(event.target.value); onErrorClear() }}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3.5 rounded-xl bg-[#e5f6ff] border-2 border-[#161514] placeholder:text-[#161514]/50 focus:outline-none focus:ring-4 focus:ring-[#d42295] font-semibold"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold" htmlFor="password">Password</label>
                    {!isRegistering && <span className="text-xs font-bold text-[#161514]/60">Password recovery unavailable</span>}
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={isRegistering ? 8 : 1}
                    maxLength={128}
                    value={password}
                    onChange={event => { setPassword(event.target.value); onErrorClear() }}
                    placeholder="Enter your password"
                    className="w-full px-4 py-3.5 rounded-xl bg-[#e5f6ff] border-2 border-[#161514] placeholder:text-[#161514]/50 focus:outline-none focus:ring-4 focus:ring-[#d42295] font-semibold"
                  />
                  {isRegistering && <p className="text-xs font-semibold mt-1.5">Use 8–128 characters.</p>}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full flex items-center justify-center gap-2 rounded-xl bg-[#161514] text-[#e5f6ff] py-4 font-extrabold hover:bg-[#d42295] transition-colors cursor-pointer"
                >
                  {loading ? 'Please wait…' : isRegistering ? 'Create account' : 'Sign in to Wagerly'} {icons.arrowRight}
                </button>
              </form>

              <div className="flex items-center gap-3 my-6">
                <div className="h-px bg-[#161514] flex-1" />
                <span className="text-xs font-bold uppercase">{isRegistering ? 'Already registered?' : 'New here?'}</span>
                <div className="h-px bg-[#161514] flex-1" />
              </div>
              <button type="button" onClick={() => { setIsRegistering(!isRegistering); onErrorClear() }} className="w-full py-3.5 rounded-xl border-2 border-[#161514] font-extrabold hover:bg-[#f46b16] transition-colors cursor-pointer">
                {isRegistering ? 'Back to sign in' : 'Create a free account'}
              </button>
              <p className="text-center text-xs font-semibold mt-5">No real money. No gambling. Just meaningful follow-through.</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App({ api = defaultApiClient }: { api?: ApiClient } = {}) {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [goals, setGoals] = useState<GoalWithTasks[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const authBootstrapStarted = useRef(false)

  useEffect(() => {
    if (authBootstrapStarted.current) return
    authBootstrapStarted.current = true

    void (async () => {
      const currentUrl = new URL(window.location.href)
      const tokenHash = currentUrl.searchParams.get('token_hash')
      const confirmationLink = currentUrl.searchParams.get('type') === 'signup'
      if (tokenHash || confirmationLink) {
        api.logout()
        currentUrl.searchParams.delete('token_hash')
        currentUrl.searchParams.delete('type')
        window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
        try {
          if (!tokenHash) throw new Error('This email confirmation link is invalid or expired.')
          const result = await api.verifyEmail(tokenHash)
          if (!result.session) throw new Error('The confirmation response did not include a session.')
          setSession(result.session)
          setAuthMessage('Email confirmed. You are now signed in.')
        } catch (cause) {
          setAuthError(cause instanceof Error ? cause.message : 'This email confirmation link is invalid or expired.')
        }
      } else {
        try {
          setSession(await api.restoreSession())
        } catch {
          setAuthError('Your session could not be renewed. Please sign in again.')
        }
      }
      setAuthReady(true)
    })()
  }, [api])

  useEffect(() => {
    function handleExpiredSession() {
      setSession(null)
      setGoals([])
      setSelectedId(null)
      setScreen('dashboard')
      setLoading(false)
      setError(null)
      setAuthMessage(null)
      setAuthError('Your session has expired. Please sign in again.')
    }
    window.addEventListener('wagerly:session-expired', handleExpiredSession)
    return () => window.removeEventListener('wagerly:session-expired', handleExpiredSession)
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (!session) {
      setGoals([])
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError(null)
    void api.listGoals()
      .then(async items => Promise.all(items.map(async goal => ({
        ...goal,
        tasks: await api.getTasks(goal.id),
      }))))
      .then(items => { if (active) setGoals(items) })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your goals.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, authReady, session])

  async function handleLogin(email: string, password: string) {
    setAuthBusy(true)
    setAuthError(null)
    setAuthMessage(null)
    try {
      const result = await api.login(email, password)
      if (!result.session) throw new Error('The login response did not include a session.')
      setSession(result.session)
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Could not sign in.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleRegister(email: string, password: string) {
    setAuthBusy(true)
    setAuthError(null)
    setAuthMessage(null)
    try {
      const result = await api.register(email, password)
      if (result.session) {
        setSession(result.session)
        setAuthMessage('Your account is ready. You are now signed in.')
      } else {
        api.logout()
        setAuthMessage('Account created. Check your email, then open the confirmation link to sign in.')
      }
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Could not create your account.')
    } finally {
      setAuthBusy(false)
    }
  }

  function handleLogout() {
    api.logout()
    setSession(null)
    setGoals([])
    setSelectedId(null)
    setScreen('dashboard')
    setError(null)
    setAuthMessage(null)
    setAuthError(null)
  }

  function saveGoal(goal: Goal) {
    setGoals(current => [
      { ...goal, tasks: [] },
      ...current.filter(item => item.id !== goal.id),
    ])
  }

  function openGoal(goal: Goal, tasks: Task[]) {
    setGoals(current => [
      { ...goal, tasks },
      ...current.filter(item => item.id !== goal.id),
    ])
    setSelectedId(goal.id)
    setScreen('detail')
  }

  const selectedGoal = selectedId ? goals.find(goal => goal.id === selectedId) : undefined
  const showSidebar = screen !== 'completion'

  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center bg-[#e5f6ff] text-sm text-zinc-600" role="status">Restoring your session…</div>
  }

  if (!session) {
    return (
      <LandingLogin
        onLogin={handleLogin}
        onRegister={handleRegister}
        onErrorClear={() => setAuthError(null)}
        error={authError}
        message={authMessage}
        loading={authBusy}
      />
    )
  }

  return (
    <div className="flex min-h-screen bg-[#e5f6ff] font-sans">
      {showSidebar && <Sidebar screen={screen} setScreen={setScreen} email={session.user?.email ?? ''} onLogout={handleLogout} />}
      <main className="flex-1 overflow-y-auto">
        {error && <div role="alert" className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="p-8 text-sm text-zinc-500" role="status">Loading your goals…</div>
        ) : screen === 'dashboard' ? (
          <Dashboard goals={goals} setScreen={setScreen} setSelectedId={setSelectedId} />
        ) : screen === 'create' ? (
          <CreateWager setScreen={setScreen} onGoalSaved={saveGoal} onOpenGoal={openGoal} api={api} />
        ) : screen === 'history' ? (
          <HistoryScreen goals={goals} setSelectedId={setSelectedId} setScreen={setScreen} />
        ) : selectedGoal ? (
          <GoalDetail
            goal={selectedGoal}
            setScreen={setScreen}
            api={api}
            onTasksChanged={tasks => setGoals(current => current.map(goal => goal.id === selectedGoal.id ? { ...goal, tasks } : goal))}
          />
        ) : (
          <Dashboard goals={goals} setScreen={setScreen} setSelectedId={setSelectedId} />
        )}
      </main>
    </div>
  )
}
