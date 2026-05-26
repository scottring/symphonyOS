import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { PlanningSession } from './PlanningSession'
import { createMockTask, createMockRoutine, resetIdCounter } from '@/test/mocks/factories'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

// Mock calendar event factory
function createMockCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
    title: 'Test Event',
    start_time: new Date().toISOString(),
    end_time: new Date(Date.now() + 3600000).toISOString(),
    all_day: false,
    ...overrides,
  }
}

describe('PlanningSession', () => {
  beforeEach(() => {
    resetIdCounter()
  })

  it('renders the planning header with close button', () => {
    const onClose = vi.fn()
    render(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={onClose}
      />
    )

    // Check that the header is present
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('displays unscheduled tasks in the drawer', () => {
    const unscheduledTask = createMockTask({ title: 'Unscheduled Task' })

    render(
      <PlanningSession
        tasks={[unscheduledTask]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Unscheduled Task')).toBeInTheDocument()
    expect(screen.getByText('Unscheduled')).toBeInTheDocument()
  })

  it('displays scheduled tasks on the correct day column', () => {
    const today = new Date()
    today.setHours(10, 0, 0, 0)

    const scheduledTask = createMockTask({
      title: 'Scheduled Task',
      scheduledFor: today,
    })

    render(
      <PlanningSession
        tasks={[scheduledTask]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDate={today}
      />
    )

    expect(screen.getByText('Scheduled Task')).toBeInTheDocument()
  })

  it('hides completed tasks', () => {
    const completedTask = createMockTask({
      title: 'Completed Task',
      completed: true,
    })

    render(
      <PlanningSession
        tasks={[completedTask]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.queryByText('Completed Task')).not.toBeInTheDocument()
  })

  it('displays events on the grid', () => {
    const today = new Date()
    today.setHours(14, 0, 0, 0)

    const event = createMockCalendarEvent({
      title: 'Team Meeting',
      start_time: today.toISOString(),
    })

    render(
      <PlanningSession
        tasks={[]}
        events={[event]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDate={today}
      />
    )

    expect(screen.getByText('Team Meeting')).toBeInTheDocument()
  })

  it('displays routines on the grid', () => {
    const routine = createMockRoutine({
      name: 'Morning Meditation',
      time_of_day: '08:00',
    })

    render(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[routine]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Morning Meditation')).toBeInTheDocument()
  })

  it('brings a clicked overlapping card to the front (raised z-index)', async () => {
    const r1 = createMockRoutine({ id: 'r1', name: 'Routine One', time_of_day: '08:00' })
    const r2 = createMockRoutine({ id: 'r2', name: 'Routine Two', time_of_day: '08:00' })
    const { user } = render(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[r1, r2]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const w1 = screen.getByTestId('placed-r1')
    expect(w1.style.zIndex).not.toBe('30')
    await user.click(w1)
    expect(w1.style.zIndex).toBe('30')
  })

  it('shows draggable routines in the drawer under a Routines heading', () => {
    const routine = createMockRoutine({
      name: 'Food shopping',
      recurrence_pattern: { type: 'weekly', days: ['sat'] },
      time_of_day: null,
    })
    render(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[]}
        draggableRoutines={[routine]}
        onScheduleRoutine={vi.fn()}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Routines')).toBeInTheDocument()
    expect(screen.getByText('Food shopping')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    const { user } = render(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={onClose}
      />
    )

    const closeButton = screen.getByRole('button', { name: /close/i })
    await user.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the task drawer with count badge', () => {
    const tasks = [
      createMockTask({ title: 'Task 1' }),
      createMockTask({ title: 'Task 2' }),
      createMockTask({ title: 'Task 3' }),
    ]

    render(
      <PlanningSession
        tasks={tasks}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('makes a placed event draggable (so it can be moved to a new time)', () => {
    const today = new Date()
    today.setHours(14, 0, 0, 0)
    const event = createMockCalendarEvent({ id: 'evt1', title: 'Team Meeting', start_time: today.toISOString() })

    render(
      <PlanningSession
        tasks={[]}
        events={[event]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDate={today}
      />
    )

    const block = screen.getByTestId('placed-evt1').querySelector('[aria-roledescription="draggable"]')
    expect(block).not.toBeNull()
  })

  it('makes a placed routine draggable (so it can be moved to a new time)', () => {
    const routine = createMockRoutine({ id: 'rt1', name: 'Morning Meditation', time_of_day: '08:00' })

    render(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[routine]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const block = screen.getByTestId('placed-rt1').querySelector('[aria-roledescription="draggable"]')
    expect(block).not.toBeNull()
  })

  it('shows empty state when all tasks are scheduled', () => {
    const today = new Date()
    today.setHours(10, 0, 0, 0)

    const scheduledTask = createMockTask({
      title: 'Scheduled Task',
      scheduledFor: today,
    })

    render(
      <PlanningSession
        tasks={[scheduledTask]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDate={today}
      />
    )

    expect(screen.getByText('All tasks scheduled')).toBeInTheDocument()
  })

  it('lays overlapping events out in side-by-side lanes (not stacked full-width)', () => {
    const today = new Date()
    today.setHours(14, 0, 0, 0)
    const end = new Date(today.getTime() + 60 * 60000)
    const e1 = createMockCalendarEvent({ id: 'ev-a', title: 'A', start_time: today.toISOString(), end_time: end.toISOString() })
    const e2 = createMockCalendarEvent({ id: 'ev-b', title: 'B', start_time: today.toISOString(), end_time: end.toISOString() })

    render(
      <PlanningSession
        tasks={[]}
        events={[e1, e2]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDate={today}
      />
    )

    const wa = screen.getByTestId('placed-ev-a')
    const wb = screen.getByTestId('placed-ev-b')
    // Two overlapping events each take half the width and sit at different left
    // offsets — i.e. side by side, not stacked on top of each other.
    expect(wa.style.width).toContain('50%')
    expect(wb.style.width).toContain('50%')
    expect(wa.style.left).not.toBe(wb.style.left)
  })

  it('collapses heavy overlap (beyond the lane cap) into a "+N" chip', () => {
    const today = new Date()
    today.setHours(9, 0, 0, 0)
    const end = new Date(today.getTime() + 60 * 60000)
    const events = Array.from({ length: 6 }, (_, i) =>
      createMockCalendarEvent({ id: `ov${i}`, title: `E${i}`, start_time: today.toISOString(), end_time: end.toISOString() })
    )

    render(
      <PlanningSession
        tasks={[]}
        events={events}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDate={today}
      />
    )

    // Cap is 4 → 3 events rendered as cards, the other 3 behind a "+3" chip.
    const renderedCards = events.filter((e) => screen.queryByTestId(`placed-${e.id}`))
    expect(renderedCards.length).toBe(3)
    expect(screen.getByRole('button', { name: /3 more overlapping items/i })).toBeInTheDocument()
  })
})
