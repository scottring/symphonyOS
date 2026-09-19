import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@/test/test-utils'
import { WeekViewV2 } from './WeekViewV2'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { ALL_LAYERS } from '@/lib/domains'

const monday = new Date(2026, 4, 18) // Monday

const defaultProps = {
  tasks: [] as Task[],
  events: [] as CalendarEvent[],
  dateInstances: [],
  weekStart: monday,
  onWeekChange: vi.fn(),
  onSelectItem: vi.fn(),
  onUpdateTask: vi.fn(),
  onUpdateEvent: vi.fn(),
  onUpdateRoutine: vi.fn(),
  layers: ALL_LAYERS,
}

function mockEvent(over: { id: string; title: string; start: string; end: string }): CalendarEvent {
  return {
    id: over.id,
    title: over.title,
    start_time: over.start,
    end_time: over.end,
  } as unknown as CalendarEvent
}

describe('WeekViewV2 layout', () => {
  // Scott, 2026-09-07: "make the this week column individually scrollable...
  // we can scroll up and down that list while the grid remains in place."
  it('gives the list column its own scroll, pinned beside the grid', () => {
    render(<WeekViewV2 {...defaultProps} routines={[]} />)
    const list = screen.getByLabelText("This week's list")
    expect(list.className).toContain('overflow-y-auto')
    expect(list.className).toContain('sticky')
  })
})

describe('WeekViewV2 week extras', () => {
  it('moves dinner into the dinner row and specials into the School subtitle', () => {
    const events = [
      mockEvent({ id: 'sch', title: 'School — Ella & Kaleb', start: '2026-05-18T08:00:00', end: '2026-05-18T15:00:00' }),
      mockEvent({ id: 'din', title: 'Dinner: Salmon + potatoes', start: '2026-05-18T07:40:00', end: '2026-05-18T08:00:00' }),
      mockEvent({ id: 'spc', title: 'Specials — Ella: Library', start: '2026-05-18T07:45:00', end: '2026-05-18T08:00:00' }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} events={events} />)
    expect(screen.getByText('Salmon + potatoes')).toBeInTheDocument()
    expect(screen.getByText('Ella: Library')).toBeInTheDocument()
    expect(screen.queryByText(/^Dinner:/)).toBeNull()
    expect(screen.queryByText(/^Specials/)).toBeNull()
  })

  it('keeps specials as a grid block on a day with no School event', () => {
    const events = [
      mockEvent({ id: 'spc', title: 'Specials — Ella: Library', start: '2026-05-18T07:45:00', end: '2026-05-18T08:00:00' }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} events={events} />)
    expect(screen.getByText('Specials — Ella: Library')).toBeInTheDocument()
  })
})

describe('WeekViewV2 routine visibility', () => {
  it('narrows routines to the selected assignee (rung 5 wiring)', async () => {
    // Regression test for the prop-threading itself, not resolveRoutine's own
    // member-narrowing logic (already exhaustively covered by
    // routineUtils.resolveRoutine.test.ts). If WeekViewV2 stopped passing
    // `member: selectedAssignees` into resolveRoutine's ctx — the exact bug
    // this task fixed — Iris's routine would render again on the grid
    // regardless of the selection, and this test would fail.
    const routines = [
      createMockRoutine({ name: 'Scott Routine', assigned_to: 'scott' }),
      createMockRoutine({ name: 'Iris Routine', assigned_to: 'iris' }),
    ]

    render(
      <WeekViewV2
        {...defaultProps}
        routines={routines}
        selectedAssignees={['scott']}
      />
    )

    // Scott's own routine still renders (once per day it recurs on — daily,
    // so every day of the visible week).
    expect((await screen.findAllByText('Scott Routine')).length).toBeGreaterThan(0)
    // Iris's routine — not owned by the selected member — is gone entirely.
    expect(screen.queryByText('Iris Routine')).toBeNull()
  })
})

// ── All-day lane + Earlier row (A2.8, A2.9) ─────────────────────────────────
// Demo run 2026-09-06: a holiday all-day event drew as an 8 AM block, and a
// 6:50 AM task got pinned to the 8 AM row alongside it.
describe('WeekViewV2 all-day lane', () => {
  const labourDayWeek = new Date(2026, 8, 7) // Monday Sep 7, 2026 (Labor Day)

  it('an all-day calendar event sits in the all-day lane', () => {
    const events = [
      {
        id: 'e1',
        title: 'Labor Day',
        start_time: '2026-09-07T00:00:00',
        end_time: '2026-09-08T00:00:00',
        is_all_day: true,
      } as unknown as CalendarEvent,
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={labourDayWeek} events={events} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))
    expect(within(screen.getByTestId('allday-2026-09-07')).getByText('Labor Day')).toBeInTheDocument()
  })

  it('a 6:50 AM task shows in the Earlier row with its time', () => {
    const tasks = [
      createMockTask({
        id: 't1',
        title: 'Get gutter cleaning quotes',
        scheduledFor: new Date(2026, 8, 7, 6, 50),
        isAllDay: false,
      }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={labourDayWeek} tasks={tasks} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))
    expect(screen.getByText(/6:50 AM · Get gutter/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Earlier: Get gutter cleaning quotes/)).toBeInTheDocument()
  })
})

// ── Journal spread (Scott, 2026-09-19) ──────────────────────────────────────
// Week opens as a seven-day journal: appointments with small times, then the
// day's untimed tasks; multi-day context ruled across the top; the hourly
// grid a switch away.
describe('WeekViewV2 journal spread', () => {
  const sunday = new Date(2026, 8, 13) // Sun Sep 13 – Sat Sep 19, 2026

  it('opens as the journal, with the hourly grid a switch away', () => {
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} />)
    expect(screen.getByTestId('week-journal')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Journal' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByTestId('allday-2026-09-13')).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))
    expect(screen.queryByTestId('week-journal')).toBeNull()
    expect(screen.getByTestId('allday-2026-09-13')).toBeInTheDocument()
  })

  it('keeps the whole day: early, timed and untimed tasks, all-day and timed events', () => {
    const tasks = [
      createMockTask({ id: 'early', title: 'Gutter quotes', scheduledFor: new Date(2026, 8, 14, 6, 50), isAllDay: false }),
      createMockTask({ id: 'timed', title: 'Call the bank', scheduledFor: new Date(2026, 8, 14, 14, 30), isAllDay: false }),
      createMockTask({ id: 'day', title: 'Return library books', scheduledFor: new Date(2026, 8, 14), isAllDay: true }),
      createMockTask({ id: 'done', title: 'Renew license', scheduledFor: new Date(2026, 8, 14), isAllDay: true, completed: true }),
    ]
    const events = [
      mockEvent({ id: 'pt', title: 'PT appointment', start: '2026-09-14T10:00:00', end: '2026-09-14T11:00:00' }),
      { id: 'hol', title: 'No school', start_time: '2026-09-14T12:00:00.000Z', end_time: '2026-09-15T12:00:00.000Z', all_day: true } as unknown as CalendarEvent,
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} tasks={tasks} events={events} />)
    const monday = within(screen.getByTestId('journal-day-2026-09-14'))
    const appointments = monday.getByRole('list', { name: 'Appointments' })
    // In time order, each with its small time label.
    expect(within(appointments).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '6:50aGutter quotes',
      '10aPT appointment',
      '2:30pCall the bank',
    ])
    const forDay = monday.getByRole('list', { name: 'For this day' })
    expect(within(forDay).getByText('Return library books')).toBeInTheDocument()
    // Done stays on the page, struck, the way a paper week keeps it.
    expect(within(forDay).getByText('Renew license')).toHaveClass('line-through')
    expect(monday.getByText('No school')).toBeInTheDocument()
  })

  it('rules multi-day context across the top — including one that began last week — and not into the days', () => {
    const events = [
      { id: 'brk', title: 'Fall break', start_time: '2026-09-10T12:00:00.000Z', end_time: '2026-09-16T12:00:00.000Z', all_day: true } as unknown as CalendarEvent,
      mockEvent({ id: 'oc', title: 'On call', start: '2026-09-16T09:00:00', end: '2026-09-18T17:00:00' }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} events={events} />)
    const across = within(screen.getByRole('group', { name: 'Across these days' }))
    expect(across.getByRole('button', { name: /Fall break.*began earlier/ })).toBeInTheDocument()
    expect(across.getByRole('button', { name: /On call/ })).toBeInTheDocument()
    for (const key of ['2026-09-13', '2026-09-16', '2026-09-17']) {
      const day = within(screen.getByTestId(`journal-day-${key}`))
      expect(day.queryByText('Fall break')).toBeNull()
      expect(day.queryByText('On call')).toBeNull()
    }
  })

  it('ticking a day task completes it with an undo that restores the exact prior state', () => {
    const pushAction = vi.fn()
    const onUpdateTask = vi.fn()
    const tasks = [createMockTask({ id: 'day', title: 'Return library books', scheduledFor: new Date(2026, 8, 14), isAllDay: true })]
    render(<WeekViewV2 {...defaultProps} onUpdateTask={onUpdateTask} pushAction={pushAction} routines={[]} weekStart={sunday} tasks={tasks} />)
    fireEvent.click(within(screen.getByTestId('journal-day-2026-09-14')).getByRole('button', { name: 'Complete Return library books' }))
    expect(pushAction).toHaveBeenCalledWith('Task completed', expect.any(Function))
    pushAction.mock.calls[0][1]()
    expect(onUpdateTask).toHaveBeenCalledWith('day', { completed: false })
  })

  it('keeps routines quiet and honours the Routines switch', () => {
    const routines = [createMockRoutine({ name: 'Morning stretch' })]
    render(<WeekViewV2 {...defaultProps} routines={routines} weekStart={sunday} />)
    expect(screen.getAllByText('Morning stretch').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('switch', { name: 'Routines' }))
    expect(screen.queryByText('Morning stretch')).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'Routines' }))
  })

  describe('on a narrow screen', () => {
    const original = window.matchMedia
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('max-width: 1023px'),
        media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia
    })
    afterEach(() => { window.matchMedia = original })

    it('stacks the days under the list and offers no hourly grid', () => {
      const tasks = [createMockTask({ id: 'day', title: 'Return library books', scheduledFor: new Date(2026, 8, 14), isAllDay: true })]
      render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} tasks={tasks} />)
      expect(screen.getByTestId('week-journal')).toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'Schedule' })).toBeNull()
      expect(within(screen.getByTestId('journal-day-2026-09-14')).getByText('Return library books')).toBeInTheDocument()
      // The list is not a sticky side column here.
      expect(screen.getByLabelText("This week's list").className).not.toContain('sticky')
    })
  })
})
