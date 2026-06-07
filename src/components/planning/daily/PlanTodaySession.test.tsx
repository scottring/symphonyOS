import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PlanTodaySession } from './PlanTodaySession'
import type { Task } from '@/types/task'

const viewedDate = new Date(2026, 5, 10, 9, 0, 0) // Wed Jun 10

function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: 't',
    completed: false,
    bucket: 'inbox',
    scheduledFor: undefined,
    isAllDay: true,
    context: null,
    assignedTo: null,
    assignedToAll: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(over as Task),
  }
}

function setup(tasksOverride?: Task[]) {
  const onPushTask = vi.fn()
  const onCompleteTask = vi.fn()
  const onClose = vi.fn()
  const tasks = tasksOverride ?? [
    task({ id: 'w1', title: 'Week one', bucket: 'week' }),
    task({ id: 'w2', title: 'Week two', bucket: 'week' }),
    task({ id: 'od', title: 'Overdue one', bucket: 'timed', scheduledFor: new Date(2020, 0, 1) }),
  ]
  const utils = render(
    <PlanTodaySession
      tasks={tasks}
      events={[]}
      viewedDate={viewedDate}
      onClose={onClose}
      onPushTask={onPushTask}
      onCompleteTask={onCompleteTask}
    />
  )
  return { onPushTask, onCompleteTask, onClose, ...utils }
}

describe('PlanTodaySession', () => {
  it('lists the week pool and carried-over items', () => {
    setup()
    expect(screen.getByText('Week one')).toBeInTheDocument()
    expect(screen.getByText('Week two')).toBeInTheDocument()
    expect(screen.getByText('Overdue one')).toBeInTheDocument()
    expect(screen.getByText(/Carried over \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Pull from this week \(2\)/)).toBeInTheDocument()
  })

  it('pulls picked week items onto today (bucket=timed via pushTask(date))', async () => {
    const { user, onPushTask } = setup()
    await user.click(screen.getByText('Week one'))
    await user.click(screen.getByText('Week two'))
    await user.click(screen.getByRole('button', { name: /Add 2 to today/ }))
    expect(onPushTask).toHaveBeenCalledTimes(2)
    // Each call targets a Date at midnight of the viewed day.
    for (const call of onPushTask.mock.calls) {
      const [, target] = call
      expect(target).toBeInstanceOf(Date)
      expect((target as Date).getHours()).toBe(0)
      expect((target as Date).getDate()).toBe(10)
    }
  })

  it('Add button is disabled until something is picked', async () => {
    const { user, onPushTask } = setup()
    const addBtn = screen.getByRole('button', { name: /Add to today/ })
    expect(addBtn).toBeDisabled()
    await user.click(screen.getByText('Week one'))
    expect(screen.getByRole('button', { name: /Add 1 to today/ })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /Add 1 to today/ }))
    expect(onPushTask).toHaveBeenCalledTimes(1)
  })

  it('carried-over "Do today" pushes to today; "Push to week" buckets; "Done" completes', async () => {
    const { user, onPushTask, onCompleteTask } = setup()
    const row = screen.getByText('Overdue one').closest('li')!
    await user.click(within(row).getByRole('button', { name: 'Do today' }))
    expect(onPushTask).toHaveBeenLastCalledWith('od', expect.any(Date))
    await user.click(within(row).getByRole('button', { name: 'Push to week' }))
    expect(onPushTask).toHaveBeenLastCalledWith('od', 'week')
    await user.click(within(row).getByRole('button', { name: 'Done' }))
    expect(onCompleteTask).toHaveBeenCalledWith('od')
  })

  it('works (renders, no carried-over section) when nothing is overdue', () => {
    setup([task({ id: 'w1', title: 'Only week', bucket: 'week' })])
    expect(screen.queryByText(/Carried over/)).not.toBeInTheDocument()
    expect(screen.getByText('Only week')).toBeInTheDocument()
  })
})
