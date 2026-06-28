import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PlanTodaySession } from './PlanTodaySession'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'

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

function setup(tasksOverride?: Task[], contacts: Contact[] = []) {
  const onPushTask = vi.fn()
  const onCompleteTask = vi.fn()
  const onSetBucket = vi.fn()
  const onClose = vi.fn()
  const tasks = tasksOverride ?? [
    task({ id: 'w1', title: 'Week one', bucket: 'week' }),
    task({ id: 'od', title: 'Overdue one', bucket: 'timed', scheduledFor: new Date(2020, 0, 1), isAllDay: false }),
  ]
  const utils = render(
    <PlanTodaySession
      tasks={tasks}
      events={[]}
      viewedDate={viewedDate}
      onClose={onClose}
      onPushTask={onPushTask}
      onCompleteTask={onCompleteTask}
      onSetBucket={onSetBucket}
      contacts={contacts}
    />
  )
  return { onPushTask, onCompleteTask, onSetBucket, onClose, ...utils }
}

describe('PlanTodaySession', () => {
  it('lists the pile (carried-over + week) with origin tags and progress', () => {
    setup()
    expect(screen.getByText('Week one')).toBeInTheDocument()
    expect(screen.getByText('Overdue one')).toBeInTheDocument()
    expect(screen.getByText('Carried over')).toBeInTheDocument()
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('0 placed · 2 to go')).toBeInTheDocument()
  })

  it('placing a slot schedules a timed task at the slot hour and updates progress', async () => {
    const { user, onPushTask } = setup([task({ id: 'w1', title: 'Only week', bucket: 'week' })])
    await user.click(screen.getByRole('button', { name: 'Afternoon' }))
    expect(onPushTask).toHaveBeenCalledTimes(1)
    const [id, target] = onPushTask.mock.calls[0]
    expect(id).toBe('w1')
    expect(target).toBeInstanceOf(Date)
    expect((target as Date).getHours()).toBe(14) // afternoon → 2pm, non-midnight = timed
    expect((target as Date).getDate()).toBe(10)
    // Optimistically moves from pile → taking shape.
    expect(screen.getByText('1 placed · 0 to go')).toBeInTheDocument()
  })

  it('"Not today" pushes the item to the week pool and removes it from the pile', async () => {
    const { user, onSetBucket } = setup([task({ id: 'od', title: 'Overdue one', bucket: 'timed', scheduledFor: new Date(2020, 0, 1), isAllDay: false })])
    await user.click(screen.getByRole('button', { name: 'Not today' }))
    expect(onSetBucket).toHaveBeenCalledWith('od', 'week')
    expect(screen.getByText('0 placed · 0 to go')).toBeInTheDocument()
  })

  it('stages a phone material as a tappable tel: link', () => {
    setup([task({ id: 'c1', title: 'Call Bob', bucket: 'week', phoneNumber: '555-0100' })])
    const link = screen.getByRole('link', { name: /Call 555-0100/ })
    expect(link).toHaveAttribute('href', 'tel:555-0100')
  })

  it('resolves a contact phone via contactId', () => {
    const contact: Contact = { id: 'k1', name: 'Dr. Lewis', phone: '(612) 555-0148', category: 'medical', createdAt: new Date(), updatedAt: new Date() }
    setup([task({ id: 't1', title: 'Call doctor', bucket: 'week', contactId: 'k1' })], [contact])
    expect(screen.getByText('(612) 555-0148')).toBeInTheDocument()
    expect(screen.getByText('Dr. Lewis')).toBeInTheDocument()
  })

  it('renders with no carried-over section when nothing is overdue', () => {
    setup([task({ id: 'w1', title: 'Only week', bucket: 'week' })])
    expect(screen.queryByText('Carried over')).not.toBeInTheDocument()
    expect(screen.getByText('Only week')).toBeInTheDocument()
  })
})
