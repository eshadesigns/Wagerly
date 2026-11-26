import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import GoalOutcome from '../src/GoalOutcome'
import type { Goal } from '../src/types'

// Use the same goal throughout the tests and change its outcome.
const testGoal: Goal = {
  id: 'goal-1',
  user_id: 'user-1',
  title: 'Study for my SWE exam',
  description: 'Review the modules and complete practice questions.',
  deadline: '2026-12-05',
  created_at: '2026-11-25',
}

describe('Goal outcomes', () => {
  it('displays the correct outcome when all tasks are completed', () => {
    render(
      <GoalOutcome
        goal={testGoal}
        status="completed"
        completedTasks={6}
        totalTasks={6}
        onBack={vi.fn()}
      />
    )

    expect(screen.getByText('Goal Completed')).toBeInTheDocument()
    expect(screen.getByText(testGoal.title)).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('6 of 6 tasks completed')).toBeInTheDocument()
    expect(screen.getByText(
      'You stayed accountable and reached your goal!'
    )).toBeInTheDocument()
  })

  it('displays a missed goal without removing the progress made', () => {
    render(
      <GoalOutcome
        goal={testGoal}
        status="missed"
        completedTasks={4}
        totalTasks={6}
        onBack={vi.fn()}
      />
    )

    expect(screen.getByText('Goal Missed')).toBeInTheDocument()
    expect(screen.queryByText('Goal Completed')).not.toBeInTheDocument()
    expect(screen.getByText('4 of 6 tasks completed')).toBeInTheDocument()
    expect(screen.getByText(
      'You did not reach your goal this time, but every step counts.'
    )).toBeInTheDocument()
  })

  it('rounds the completion percentage correctly', () => {
    render(
      <GoalOutcome
        goal={testGoal}
        status="missed"
        completedTasks={4}
        totalTasks={6}
        onBack={vi.fn()}
      />
    )

    // Check that the displayed percentage and progress bar match.
    expect(screen.getByText('67%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow', '67'
    )
  })

  it('displays zero progress when no tasks were completed', () => {
    render(
      <GoalOutcome
        goal={testGoal}
        status="missed"
        completedTasks={0}
        totalTasks={6}
        onBack={vi.fn()}
      />
    )

    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText('0 of 6 tasks completed')).toBeInTheDocument()
  })

  it('handles a goal that does not have any tasks', () => {
    render(
      <GoalOutcome
        goal={testGoal}
        status="missed"
        completedTasks={0}
        totalTasks={0}
        onBack={vi.fn()}
      />
    )

    // Make sure having no tasks does not cause an invalid percentage.
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.queryByText('NaN%')).not.toBeInTheDocument()
    expect(screen.getByText('0 of 0 tasks completed')).toBeInTheDocument()
  })

  it('triggers the callback to return to the dashboard', async () => {
    const user = userEvent.setup()
    const goBack = vi.fn()

    render(
      <GoalOutcome
        goal={testGoal}
        status="completed"
        completedTasks={6}
        totalTasks={6}
        onBack={goBack}
      />
    )

    await user.click(screen.getByRole('button', {
      name: 'Back to Dashboard',
    }))

    expect(goBack).toHaveBeenCalledTimes(1)
  })
})
