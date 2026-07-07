import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PlanTodaySession } from './PlanTodaySession'
import type { Task } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/actionable'

const viewedDate = new Date(2026, 5, 10, 9, 0, 0) // Wed Jun 10

function makeRoutine(over: Partial<Routine> & Pick<Routine, 'name' | 'recurrence_pattern'>): Routine {
  return {
    id: over.name.replace(/\s+/g, '-').toLowerCase(),
    user_id: 'u1',
    description: null,
    default_assignee: null,
    assigned_to: null,
    assigned_to_all: null,
    visibility: 'active',
    paused_until: null,
    time_of_day: null,
    raw_input: null,
    show_on_timeline: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Routine
}

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

function setup(tasksOverride?: Task[], contacts: Contact[] = [], routines: Routine[] = []) {
  const onPushTask = vi.fn()
  const onCompleteTask = vi.fn()
  const onSetBucket = vi.fn()
  const onClose = vi.fn()
  const onUpdateRoutine = vi.fn()
  const onCompleteRoutine = vi.fn()
  const onFlagDiscussion = vi.fn()
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
      onCompleteRoutine={onCompleteRoutine}
      onSetBucket={onSetBucket}
      onFlagDiscussion={onFlagDiscussion}
      contacts={contacts}
      routines={routines}
      onUpdateRoutine={onUpdateRoutine}
    />
  )
  return { onPushTask, onCompleteTask, onSetBucket, onClose, onUpdateRoutine, onCompleteRoutine, ...utils, onFlagDiscussion }
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

  it('"Needs a conversation" flags discussion and moves the task to the week pool', async () => {
    const { user, onFlagDiscussion, onSetBucket } = setup([
      task({ id: 'dc', title: 'Donate clothes', bucket: 'week' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Needs a conversation' }))
    await user.type(screen.getByLabelText(/who to discuss with/i), 'Iris — which clothes & where')
    await user.click(screen.getByRole('button', { name: 'Flag it' }))

    expect(onFlagDiscussion).toHaveBeenCalledWith('dc', 'Iris — which clothes & where')
    expect(onSetBucket).toHaveBeenCalledWith('dc', 'week')
    // Card leaves the pile
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

  it('includes non-daily untimed routines due that day in the pile', () => {
    const weekly = makeRoutine({ name: 'Food shopping', recurrence_pattern: { type: 'weekly', days: ['wed'] } })
    setup([], [], [weekly])
    expect(screen.getByText('Food shopping')).toBeInTheDocument()
    expect(screen.getByText('Routine')).toBeInTheDocument() // origin tag
  })

  it('excludes daily routines (the standing rhythm) and routines not due today', () => {
    const daily = makeRoutine({ name: 'Brush teeth', recurrence_pattern: { type: 'daily' } })
    const otherDay = makeRoutine({ name: 'Sunday reset', recurrence_pattern: { type: 'weekly', days: ['sun'] } })
    setup([], [], [daily, otherDay])
    expect(screen.queryByText('Brush teeth')).not.toBeInTheDocument()
    expect(screen.queryByText('Sunday reset')).not.toBeInTheDocument()
  })

  it('placing a routine sets its time_of_day to the slot hour', async () => {
    const weekly = makeRoutine({ name: 'Food shopping', recurrence_pattern: { type: 'weekly', days: ['wed'] } })
    const { user, onUpdateRoutine } = setup([], [], [weekly])
    await user.click(screen.getByRole('button', { name: 'Morning' }))
    expect(onUpdateRoutine).toHaveBeenCalledWith('food-shopping', { time_of_day: '09:00:00' })
    // optimistically moves into "taking shape"
    expect(screen.getByText('1 placed · 0 to go')).toBeInTheDocument()
  })

  it('unplaces a placed task — back to "to place"', async () => {
    const placed = task({ id: 'pt', title: 'Placed task', bucket: 'timed', scheduledFor: new Date(2026, 5, 10, 9, 0), isAllDay: false })
    const { user, onSetBucket } = setup([placed])
    expect(screen.getByText('1 placed · 0 to go')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Put Placed task back to place' }))
    expect(onSetBucket).toHaveBeenCalledWith('pt', 'week')
    // Leaves placed and returns to the pile.
    expect(screen.getByText('0 placed · 1 to go')).toBeInTheDocument()
  })

  it('completes a placed task from the day-shaping panel', async () => {
    const placed = task({ id: 'pt', title: 'Placed task', bucket: 'timed', scheduledFor: new Date(2026, 5, 10, 9, 0), isAllDay: false })
    const { user, onCompleteTask } = setup([placed])
    await user.click(screen.getByRole('button', { name: 'Complete Placed task' }))
    expect(onCompleteTask).toHaveBeenCalledWith('pt')
    // No longer in the placed panel.
    expect(screen.queryByRole('button', { name: 'Complete Placed task' })).toBeNull()
  })

  it('completes a placed (already-timed) routine', async () => {
    const timed = makeRoutine({ name: 'Morning walk', recurrence_pattern: { type: 'weekly', days: ['wed'] }, time_of_day: '09:00' })
    const { user, onCompleteRoutine } = setup([], [], [timed])
    await user.click(screen.getByRole('button', { name: 'Complete Morning walk' }))
    expect(onCompleteRoutine).toHaveBeenCalledWith('morning-walk')
  })
})
