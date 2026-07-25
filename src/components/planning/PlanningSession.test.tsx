import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
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
    const unscheduledTask = createMockTask({ title: 'Unscheduled Task', bucket: 'week' })

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

  it('keeps backlog (inbox) tasks behind the Show-more expander', () => {
    const relevant = createMockTask({ id: 'rel', title: 'Week task', bucket: 'week' })
    const backlog = createMockTask({ id: 'back', title: 'Someday side quest' })

    render(
      <PlanningSession
        tasks={[relevant, backlog]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Week task')).toBeInTheDocument()
    expect(screen.queryByText('Someday side quest')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/show 1 more from the backlog/i))
    expect(screen.getByText('Someday side quest')).toBeInTheDocument()

    fireEvent.click(screen.getByText(/show today-relevant only/i))
    expect(screen.queryByText('Someday side quest')).not.toBeInTheDocument()
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
      createMockTask({ title: 'Task 1', bucket: 'week' }),
      createMockTask({ title: 'Task 2', bucket: 'week' }),
      createMockTask({ title: 'Task 3', bucket: 'week' }),
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

  it('renders a "→ day" button per day header when onOpenDay is given, none without it', () => {
    const onOpenDay = vi.fn()
    const { rerender } = render(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        onOpenDay={onOpenDay}
      />
    )

    // Default range is a single day — grow it to 7 via the header's "Add day"
    // control (max 7, same as the week-planning grid).
    const addDay = screen.getByRole('button', { name: /add day/i })
    for (let i = 0; i < 6; i++) fireEvent.click(addDay)

    const openDayButtons = screen.getAllByRole('button', { name: /open .* on today/i })
    expect(openDayButtons).toHaveLength(7)

    fireEvent.click(openDayButtons[0])
    expect(onOpenDay).toHaveBeenCalledTimes(1)
    expect(onOpenDay.mock.calls[0][0]).toBeInstanceOf(Date)

    rerender(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryAllByRole('button', { name: /open .* on today/i })).toHaveLength(0)
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

  it('renders the shelf above the grid instead of the drawer when shelf prop is set', () => {
    render(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDays={7}
        shelf={{
          carryOverIds: new Set<string>(),
          projectsMap: new Map(),
          tasksById: new Map(),
          onOpenTask: vi.fn(), onSetBucket: vi.fn(), onDeleteTask: vi.fn(), onPushTask: vi.fn(),
          draft: '', onDraftChange: vi.fn(), onSubmitDraft: vi.fn(),
          tend: { status: 'idle', aiLoading: false, aiError: null, proposals: [], start: vi.fn(), remove: vi.fn(), done: vi.fn() },
          onApplyProposal: vi.fn(),
        }}
      />
    )
    expect(screen.queryByText('Unscheduled')).not.toBeInTheDocument() // drawer gone
    expect(screen.getByRole('button', { name: /tend/i })).toBeInTheDocument() // shelf present
  })

  it('renders an in-range all-day task in the lane, not the pool', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const allDayTask = createMockTask({
      title: 'Passport renewal',
      isAllDay: true,
      scheduledFor: today,
    })

    render(
      <PlanningSession
        tasks={[allDayTask]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDate={today}
      />
    )

    const lane = screen.getByTestId('allday-lane')
    expect(lane).toHaveTextContent('Passport renewal')
    // Not in the drawer/pool — the drawer shows its "all scheduled" empty state.
    expect(screen.getByText('All tasks scheduled')).toBeInTheDocument()
  })

  it('does not render the all-day lane chip for out-of-range all-day tasks (they stay in the pool)', () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const farFuture = new Date(today)
    farFuture.setDate(farFuture.getDate() + 30)

    const allDayTask = createMockTask({
      title: 'Future all-day task',
      isAllDay: true,
      scheduledFor: farFuture,
    })

    render(
      <PlanningSession
        tasks={[allDayTask]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDate={today}
      />
    )

    // Out-of-range all-day task still shows in the drawer pool, not the lane.
    const lane = screen.getByTestId('allday-lane')
    expect(lane).not.toHaveTextContent('Future all-day task')
    expect(screen.getByText('Future all-day task')).toBeInTheDocument()
  })

  it('initialDays seeds a multi-day range', () => {
    const onOpenDay = vi.fn()
    render(
      <PlanningSession
        tasks={[]}
        events={[]}
        routines={[]}
        onUpdateTask={vi.fn()}
        onPushTask={vi.fn()}
        onClose={vi.fn()}
        initialDate={new Date(2026, 6, 19)}
        initialDays={7}
        onOpenDay={onOpenDay}
      />
    )
    // Reuse the "→ day" header-button query pattern: one per day column.
    expect(screen.getAllByRole('button', { name: /open .* on today/i })).toHaveLength(7)
  })

  describe('click-to-create on an empty slot', () => {
    // Fixed local date, decoupled from "today" so minDropDate math is stable.
    const day = new Date(2026, 6, 20)
    const dateKey = formatDateKey(day)
    const slotSelector = `[data-droppable-id="slot-${dateKey}-10-30"]`

    it('opens the quick-create input when clicking an empty slot', () => {
      const { container } = render(
        <PlanningSession
          tasks={[]}
          events={[]}
          routines={[]}
          onUpdateTask={vi.fn()}
          onPushTask={vi.fn()}
          onClose={vi.fn()}
          initialDate={day}
          onCreateTaskAt={vi.fn()}
        />
      )

      expect(screen.queryByRole('dialog', { name: /create task/i })).not.toBeInTheDocument()

      const slot = container.querySelector(slotSelector)
      expect(slot).not.toBeNull()
      fireEvent.click(slot!)

      expect(screen.getByRole('dialog', { name: /create task/i })).toBeInTheDocument()
    })

    it('typing a title and pressing Enter creates a task at the exact slot time and closes the popover', () => {
      const onCreateTaskAt = vi.fn()
      const { container } = render(
        <PlanningSession
          tasks={[]}
          events={[]}
          routines={[]}
          onUpdateTask={vi.fn()}
          onPushTask={vi.fn()}
          onClose={vi.fn()}
          initialDate={day}
          onCreateTaskAt={onCreateTaskAt}
        />
      )

      const slot = container.querySelector(slotSelector)
      fireEvent.click(slot!)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Dentist appointment' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onCreateTaskAt).toHaveBeenCalledTimes(1)
      const [title, scheduledFor] = onCreateTaskAt.mock.calls[0]
      expect(title).toBe('Dentist appointment')
      expect(scheduledFor).toEqual(new Date(2026, 6, 20, 10, 30, 0, 0))

      expect(screen.queryByRole('dialog', { name: /create task/i })).not.toBeInTheDocument()
    })

    it('Escape closes the popover without creating a task', () => {
      const onCreateTaskAt = vi.fn()
      const { container } = render(
        <PlanningSession
          tasks={[]}
          events={[]}
          routines={[]}
          onUpdateTask={vi.fn()}
          onPushTask={vi.fn()}
          onClose={vi.fn()}
          initialDate={day}
          onCreateTaskAt={onCreateTaskAt}
        />
      )

      const slot = container.querySelector(slotSelector)
      fireEvent.click(slot!)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Should not save' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(onCreateTaskAt).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: /create task/i })).not.toBeInTheDocument()
    })

    it('clicking a slot on a day before minDropDate shows the refusal notice and does not open the popover', () => {
      const onCreateTaskAt = vi.fn()
      const yesterday = new Date(day)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayKey = formatDateKey(yesterday)

      const { container } = render(
        <PlanningSession
          tasks={[]}
          events={[]}
          routines={[]}
          onUpdateTask={vi.fn()}
          onPushTask={vi.fn()}
          onClose={vi.fn()}
          initialDate={yesterday}
          initialDays={2}
          minDropDate={day}
          onCreateTaskAt={onCreateTaskAt}
        />
      )

      const slot = container.querySelector(`[data-droppable-id="slot-${yesterdayKey}-10-30"]`)
      expect(slot).not.toBeNull()
      fireEvent.click(slot!)

      expect(screen.getByText(/already behind you/i)).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: /create task/i })).not.toBeInTheDocument()
      expect(onCreateTaskAt).not.toHaveBeenCalled()
    })

    it('does nothing when onCreateTaskAt is not provided', () => {
      const { container } = render(
        <PlanningSession
          tasks={[]}
          events={[]}
          routines={[]}
          onUpdateTask={vi.fn()}
          onPushTask={vi.fn()}
          onClose={vi.fn()}
          initialDate={day}
        />
      )

      const slot = container.querySelector(slotSelector)
      expect(slot).not.toBeNull()
      fireEvent.click(slot!)

      expect(screen.queryByRole('dialog', { name: /create task/i })).not.toBeInTheDocument()
    })
  })

  // ── The week rung asks WHICH DAY and stops there. On a day-grain surface the
  // hour under the cursor is incidental — giving it a time would be Today's job
  // done badly, by wherever the pointer happened to land. ──
  describe('placementGrain="day"', () => {
    const day = new Date(2026, 6, 20)
    const slotSelector = `[data-droppable-id="slot-${formatDateKey(day)}-10-30"]`

    it('a slot click creates the task on the DAY, with no time', () => {
      const onCreateTaskAt = vi.fn()
      const { container } = render(
        <PlanningSession
          tasks={[]}
          events={[]}
          routines={[]}
          onUpdateTask={vi.fn()}
          onPushTask={vi.fn()}
          onClose={vi.fn()}
          initialDate={day}
          onCreateTaskAt={onCreateTaskAt}
          placementGrain="day"
        />
      )

      fireEvent.click(container.querySelector(slotSelector)!)
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Order the vanity' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      const [, scheduledFor] = onCreateTaskAt.mock.calls[0]
      // Midnight — the 10:30 slot that was clicked is deliberately ignored.
      expect(scheduledFor).toEqual(new Date(2026, 6, 20))
    })

    it('the default grain still honors the slot time (Today keeps asking what time)', () => {
      const onCreateTaskAt = vi.fn()
      const { container } = render(
        <PlanningSession
          tasks={[]}
          events={[]}
          routines={[]}
          onUpdateTask={vi.fn()}
          onPushTask={vi.fn()}
          onClose={vi.fn()}
          initialDate={day}
          onCreateTaskAt={onCreateTaskAt}
        />
      )

      fireEvent.click(container.querySelector(slotSelector)!)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dentist' } })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

      expect(onCreateTaskAt.mock.calls[0][1]).toEqual(new Date(2026, 6, 20, 10, 30, 0, 0))
    })
  })

  // Every week placement lands in the all-day lane, so the lane must be able to
  // hold them. A fixed 2-chip lane would hide the third thing planned for a day
  // behind "+1" — written but invisible, which reads as data loss.
  describe('all-day lane capacity', () => {
    it('shows more than two day-level placements on one day', () => {
      const day = new Date(2026, 6, 20)
      const tasks = ['Order the vanity', 'Call the plumber', 'Book the mover', 'Return the tile']
        .map((title) => createMockTask({ title, isAllDay: true, scheduledFor: day, bucket: 'timed' }))

      render(
        <PlanningSession
          tasks={tasks}
          events={[]}
          routines={[]}
          onUpdateTask={vi.fn()}
          onPushTask={vi.fn()}
          onClose={vi.fn()}
          initialDate={day}
        />
      )

      const lane = screen.getByTestId('allday-lane')
      for (const title of ['Order the vanity', 'Call the plumber', 'Book the mover', 'Return the tile']) {
        expect(lane).toHaveTextContent(title)
      }
      expect(lane).not.toHaveTextContent('+1')
    })
  })
})

// Helper to format date as YYYY-MM-DD, matching PlanningSession's internal
// dateKey format used for slot droppable ids.
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
