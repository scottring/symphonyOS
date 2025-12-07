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
})
