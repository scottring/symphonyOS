import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { StepBuildTodos } from './StepBuildTodos'
import type { Task } from '@/types/task'
import type { GoalAction } from '@/types/goal'
import type { Routine } from '@/types/actionable'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    completed: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeRoutine(over: Partial<Routine> & Pick<Routine, 'id' | 'name'>): Routine {
  return {
    user_id: 'u1',
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    visibility: 'active',
    paused_until: null,
    recurrence_pattern: { type: 'weekly', days: [] },
    time_of_day: null,
    raw_input: null,
    show_on_timeline: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const inboxTask = makeTask({ id: 'task-inbox', title: 'Inbox task', bucket: 'inbox' })
const weekTask = makeTask({ id: 'task-week', title: 'Week task', bucket: 'week' })
const monthTask = makeTask({ id: 'task-month', title: 'Month task', bucket: 'month' })
const somedayTask = makeTask({ id: 'task-someday', title: 'Someday task', bucket: 'quarter' })

const allTasks = [inboxTask, weekTask, monthTask, somedayTask]

const goalAction: GoalAction = {
  id: 'action-1',
  goalId: 'goal-1',
  description: 'Finish the prototype',
  quarter: 'Q2',
  completed: false,
  sortOrder: 0,
  createdAt: new Date('2026-01-01'),
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StepBuildTodos', () => {
  it('renders candidate groups; checking an inbox task calls onToggle', async () => {
    const onToggle = vi.fn()
    const { user } = render(
      <StepBuildTodos
        tasks={allTasks}
        selectedIds={[]}
        onToggle={onToggle}
        onReorder={vi.fn()}
      />,
    )

    // Candidate groups are visible
    expect(screen.getByText('Inbox task')).toBeInTheDocument()
    expect(screen.getByText('Week task')).toBeInTheDocument()
    expect(screen.getByText('Month task')).toBeInTheDocument()
    expect(screen.getByText('Someday task')).toBeInTheDocument()

    // Clicking the checkbox calls onToggle with the inbox task
    const checkbox = screen.getByRole('checkbox', { name: 'Inbox task' })
    expect(checkbox).not.toBeChecked()
    await user.click(checkbox)
    expect(onToggle).toHaveBeenCalledWith(inboxTask)
  })

  it('renders selected ids in priority order; ChevronDown on first item calls onReorder with swapped order', async () => {
    const onReorder = vi.fn()
    const { user } = render(
      <StepBuildTodos
        tasks={allTasks}
        selectedIds={[inboxTask.id, weekTask.id]}
        onToggle={vi.fn()}
        onReorder={onReorder}
      />,
    )

    // Both appear in the priority column (the <ol> has data-testid="priority-order")
    const priorityList = screen.getByTestId('priority-order')
    const items = within(priorityList).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Inbox task')
    expect(items[1]).toHaveTextContent('Week task')

    // ChevronDown on first item swaps to [weekTask, inboxTask]
    const moveDownButtons = screen.getAllByRole('button', { name: 'Move down' })
    // First item's move-down should be enabled; last item's disabled
    expect(moveDownButtons[0]).not.toBeDisabled()
    expect(moveDownButtons[1]).toBeDisabled()

    await user.click(moveDownButtons[0])
    expect(onReorder).toHaveBeenCalledWith([weekTask.id, inboxTask.id])
  })

  it('renders goal actions section; clicking Add as task calls onAddGoalAction; added id disables the button', async () => {
    const onAddGoalAction = vi.fn()
    const { user, rerender } = render(
      <StepBuildTodos
        tasks={allTasks}
        selectedIds={[]}
        onToggle={vi.fn()}
        onReorder={vi.fn()}
        goalActions={[goalAction]}
        addedGoalActionIds={[]}
        onAddGoalAction={onAddGoalAction}
      />,
    )

    // Section heading visible
    expect(screen.getByText(/goal actions/i)).toBeInTheDocument()
    // Action description visible
    expect(screen.getByText('Finish the prototype')).toBeInTheDocument()

    // Click "Add as task"
    const addButton = screen.getByRole('button', { name: /add as task/i })
    expect(addButton).not.toBeDisabled()
    await user.click(addButton)
    expect(onAddGoalAction).toHaveBeenCalledWith(goalAction)

    // Re-render with the action id in addedGoalActionIds → button disabled and shows "Added"
    rerender(
      <StepBuildTodos
        tasks={allTasks}
        selectedIds={[]}
        onToggle={vi.fn()}
        onReorder={vi.fn()}
        goalActions={[goalAction]}
        addedGoalActionIds={[goalAction.id]}
        onAddGoalAction={onAddGoalAction}
      />,
    )

    const addedButton = screen.getByRole('button', { name: /added/i })
    expect(addedButton).toBeDisabled()
  })

  describe('routines this week', () => {
    it('lists provided routines as checkboxes; checking one calls onToggleRoutine', async () => {
      const onToggleRoutine = vi.fn()
      const foodShopping = makeRoutine({ id: 'r1', name: 'Food shopping' })
      const foodPlanning = makeRoutine({ id: 'r2', name: 'Food planning' })
      const { user } = render(
        <StepBuildTodos
          tasks={allTasks}
          selectedIds={[]}
          onToggle={vi.fn()}
          onReorder={vi.fn()}
          routines={[foodShopping, foodPlanning]}
          selectedRoutineIds={[]}
          onToggleRoutine={onToggleRoutine}
        />,
      )
      expect(screen.getByText(/routines this week/i)).toBeInTheDocument()
      const checkbox = screen.getByRole('checkbox', { name: 'Food shopping' })
      expect(checkbox).not.toBeChecked()
      await user.click(checkbox)
      expect(onToggleRoutine).toHaveBeenCalledWith(foodShopping)
    })

    it('does not render the routines group when none are provided', () => {
      render(
        <StepBuildTodos tasks={allTasks} selectedIds={[]} onToggle={vi.fn()} onReorder={vi.fn()} />,
      )
      expect(screen.queryByText(/routines this week/i)).not.toBeInTheDocument()
    })

    it('shows selected routines in the priority column and checks their boxes', () => {
      const foodShopping = makeRoutine({ id: 'r1', name: 'Food shopping' })
      render(
        <StepBuildTodos
          tasks={allTasks}
          selectedIds={[]}
          onToggle={vi.fn()}
          onReorder={vi.fn()}
          routines={[foodShopping]}
          selectedRoutineIds={['r1']}
          onToggleRoutine={vi.fn()}
        />,
      )
      expect(screen.getByRole('checkbox', { name: 'Food shopping' })).toBeChecked()
      const priorityRoutines = screen.getByTestId('priority-routines')
      expect(within(priorityRoutines).getByText('Food shopping')).toBeInTheDocument()
    })
  })
})
