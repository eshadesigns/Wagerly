import type { Goal, WagerStatus } from './types'

interface GoalOutcomeProps {
  goal: Goal
  status: Extract<WagerStatus, 'completed' | 'missed'>
  completedTasks: number
  totalTasks: number
  onBack: () => void
}

export default function GoalOutcome({
  goal,
  status,
  completedTasks,
  totalTasks,
  onBack,
}: GoalOutcomeProps) {
  const goalCompleted = status === 'completed'

  // Calculate the percentage of tasks completed.
  // If there are no tasks, keep the percentage at 0.
  const completionRate = totalTasks === 0
    ? 0
    : Math.round((completedTasks / totalTasks) * 100)

  return (
    <div className="p-8 max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 text-center">

        {/* Change the heading and message based on the goal outcome */}
        <h1 className={`text-2xl font-semibold mb-2 ${
          goalCompleted ? 'text-emerald-600' : 'text-red-600'
        }`}>
          {goalCompleted ? 'Goal Completed' : 'Goal Missed'}
        </h1>

        <p className="text-lg font-medium text-zinc-900 mb-2">
          {goal.title}
        </p>

        <p className="text-sm text-zinc-500 mb-6">
          {goalCompleted
            ? 'You stayed accountable and reached your goal!'
            : 'You did not reach your goal this time, but every step counts.'}
        </p>

        {/* Show how much progress was made even if the goal was missed */}
        <div className="flex justify-between text-sm mb-2">
          <span>Final progress</span>
          <span className="font-semibold">{completionRate}%</span>
        </div>

        <div
          role="progressbar"
          aria-label="Final goal progress"
          aria-valuenow={completionRate}
          aria-valuemin={0}
          aria-valuemax={100}
          className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden"
        >
          <div
            className={`h-full rounded-full ${
              goalCompleted ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${completionRate}%` }}
          />
        </div>

        <p className="text-sm text-zinc-500 mt-3">
          {completedTasks} of {totalTasks} tasks completed
        </p>

        <button
          onClick={onBack}
          className="w-full mt-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 cursor-pointer"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
