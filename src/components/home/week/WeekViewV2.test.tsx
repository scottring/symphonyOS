import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@/test/test-utils'
import { WeekViewV2 } from './WeekViewV2'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import type { RecurrencePattern } from '@/types/actionable'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { ALL_LAYERS } from '@/lib/domains'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

// The Planning sheet (narrow screens) computes its own plan from the shared
// sources; these tests are about the week's viewport, so the sources are
// stubbed rather than mounted.
// The real tasks hook, with the tick's result under the test's control — the
// Undo toast is only pushed once the write says it succeeded.
const toggleResult = { ok: true }
vi.mock('@/hooks/useSupabaseTasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSupabaseTasks')>()
  return { ...actual, useSupabaseTasks: () => ({ ...actual.useSupabaseTasks(), toggleTask: async () => toggleResult.ok }) }
})

vi.mock('@/hooks/useDayPlan', () => ({
  useDayPlan: () => ({
    loading: false, error: false,
    plan: {
      toPlan: [{ key: 'task:p', kind: 'task', id: 'p', title: 'Something to plan', completed: false, planned: false, group: 'plan' }],
      carried: [], scheduled: [], available: [], week: [], month: [],
      counts: { scheduled: 0, available: 0 }, offMainTaskIds: new Set(), offMainRoutineItemIds: new Set(), plannedExtraTasks: [],
    },
  }),
}))
vi.mock('@/hooks/usePlanActions', () => ({
  usePlanActions: () => ({
    chooseTaskDay: vi.fn(), unchooseTask: vi.fn(), timeTask: vi.fn(), commitTask: vi.fn(),
    chooseRoutine: vi.fn(), drop: vi.fn(), toggleTask: vi.fn(), completeRoutine: vi.fn(async () => true),
  }),
}))

const instancesMock = vi.hoisted(() => ({ rows: [] as unknown[], markDone: vi.fn(async () => true), undoDone: vi.fn(async () => true) }))
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({
    getInstancesForRange: async () => instancesMock.rows,
    markDone: instancesMock.markDone, undoDone: instancesMock.undoDone,
    setPlanned: vi.fn(async () => true), reschedule: vi.fn(async () => null),
  }),
}))

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
  // Scott, 2026-09-21: the week's viewport is the days. Planning is ONE panel
  // (the dock beside the page), opened from a labelled button, never a
  // second column of lists to understand first.
  it('gives the desktop viewport to the days; the shell owns the task chooser', () => {
    render(<WeekViewV2 {...defaultProps} routines={[]} />)
    expect(screen.getByRole('region', { name: "This week's list" })).toBeInTheDocument()
    expect(screen.queryByText(/Didn.t happen/)).toBeNull()
    expect(screen.queryByRole('button', { name: /This month/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Shelves' })).not.toBeInTheDocument()
  })

  it('shows a week task on "This week\'s list" above the days and lets it be ticked', () => {
    const anchor = weekStartAnchor(monday, readCadenceConfig().weekStartsOn)
    const t = createMockTask({ id: 'w', title: 'Call the plumber', bucket: 'week', weekStart: anchor, commitments: [{ level: 'week', periodStart: anchor, status: 'open' }] })
    render(<WeekViewV2 {...defaultProps} tasks={[t]} routines={[]} />)
    const list = within(screen.getByRole('region', { name: "This week's list" }))
    expect(list.getByText('Call the plumber')).toBeInTheDocument()
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
    expect(screen.getByRole('region', { name: "This week's list" })).toBeInTheDocument()
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

  it('keeps the whole day as one row: timed entries in order, then the day\'s untimed work', () => {
    const tasks = [
      createMockTask({ id: 'early', title: 'Gutter quotes', scheduledFor: new Date(2026, 8, 14, 6, 50), isAllDay: false }),
      createMockTask({ id: 'timed', title: 'Call the bank', scheduledFor: new Date(2026, 8, 14, 14, 30), isAllDay: false }),
      createMockTask({ id: 'day', title: 'Return library books', scheduledFor: new Date(2026, 8, 14), isAllDay: true }),
      createMockTask({ id: 'done', title: 'Renew license', scheduledFor: new Date(2026, 8, 14), isAllDay: true, completed: true }),
      // A week-list task CHOSEN for Monday keeps its list and is Monday's work.
      createMockTask({ id: 'chosen', title: 'Book the plumber', bucket: 'week', plannedOn: new Date(2026, 8, 14) }),
    ]
    const events = [
      mockEvent({ id: 'pt', title: 'PT appointment', start: '2026-09-14T10:00:00', end: '2026-09-14T11:00:00' }),
      { id: 'hol', title: 'No school', start_time: '2026-09-14T12:00:00.000Z', end_time: '2026-09-15T12:00:00.000Z', all_day: true } as unknown as CalendarEvent,
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} tasks={tasks} events={events} />)
    const monday = within(screen.getByTestId('journal-day-2026-09-14'))
    const entries = [...within(monday.getByRole('list', { name: 'Schedule entries' })).getAllByRole('listitem'), ...within(monday.getByRole('list', { name: 'Any time entries' })).getAllByRole('listitem')]
    // The title only: a task row also wears the shared timing control, which
    // is asserted separately below.
    expect(entries.map((li) => li.querySelector('.journal-entry-title')?.textContent)).toEqual([
      '6:50aGutter quotes',
      '10aPT appointment',
      '2:30pCall the bank',
      'Return library books',
      'Book the plumber',
      'Renew license',
    ])
    // Done stays on the page, struck, the way a paper week keeps it.
    expect(monday.getByText('Renew license')).toHaveClass('line-through')
    expect(monday.getByText('No school')).toBeInTheDocument()
  })

  // Codex live test, 2026-09-24: an action that moved out of "Any day" onto
  // Monday lost the one visible control that says when it is to be done. The
  // week's list has it, the day rows must too — the same control, in place.
  it('gives a day\'s task the same timing control the week list wears', () => {
    const anchor = weekStartAnchor(sunday, readCadenceConfig().weekStartsOn)
    const tasks = [
      createMockTask({ id: 'day', title: 'List supplies to buy', scheduledFor: new Date(2026, 8, 14), isAllDay: true,
        commitments: [{ level: 'week', periodStart: anchor, status: 'open' }] }),
      createMockTask({ id: 'done', title: 'Renew license', scheduledFor: new Date(2026, 8, 14), isAllDay: true, completed: true }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} tasks={tasks} events={[]} />)
    const monday = within(screen.getByTestId('journal-day-2026-09-14'))
    const control = monday.getByRole('button', { name: /Choose a week or a day for List supplies to buy/ })
    // It wears the answer, the way it does everywhere else.
    expect(control).toHaveTextContent(/Sep 14/)
    // A finished row is a record, not something to re-time.
    expect(monday.queryByRole('button', { name: /Choose a week or a day for Renew license/ })).toBeNull()
  })

  it('keeps the journal control out of the way of the row drag', () => {
    const tasks = [createMockTask({ id: 'day', title: 'List supplies to buy', scheduledFor: new Date(2026, 8, 14), isAllDay: true })]
    // dnd-kit's drag listeners are REACT handlers on the row, so the guard has
    // to stop React's propagation — a native listener would see the event
    // either way. An ancestor spy in the same React tree tells the two apart:
    // without the guard the press reaches it, with the guard it does not.
    const seen = vi.fn()
    render(
      <div onPointerDown={seen}>
        <WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} tasks={tasks} events={[]} />
      </div>,
    )
    const monday = within(screen.getByTestId('journal-day-2026-09-14'))
    const control = monday.getByRole('button', { name: /Choose a week or a day for List supplies to buy/ })
    fireEvent.pointerDown(control)
    expect(seen).not.toHaveBeenCalled()
    // A press on the row itself still reaches the drag.
    fireEvent.pointerDown(monday.getByText('List supplies to buy'))
    expect(seen).toHaveBeenCalled()
  })

  it('lists multi-day context once above the days — including one that began last week — and not in the days', () => {
    const events = [
      { id: 'brk', title: 'Fall break', start_time: '2026-09-10T12:00:00.000Z', end_time: '2026-09-16T12:00:00.000Z', all_day: true } as unknown as CalendarEvent,
      mockEvent({ id: 'oc', title: 'On call ', start: '2026-09-16T09:00:00', end: '2026-09-18T17:00:00' }),
      { id: 'trip', title: 'Trip', start_time: '2026-09-18T12:00:00.000Z', end_time: '2026-09-22T12:00:00.000Z', all_day: true } as unknown as CalendarEvent,
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} events={events} />)
    const across = within(screen.getByRole('list', { name: 'Across these days' }))
    // A bar cut by the week's edge names the day it really starts or ends on —
    // never a dangling ", continues on" (seen on prod 2026-09-20).
    // (textContent, not the accessible name — dom-accessibility-api pads inline spans with a space.)
    expect(across.getByRole('button', { name: /Fall break/ })).toHaveTextContent(/^Sun–Tue Fall break, from Thu Sep 10$/)
    expect(across.getByRole('button', { name: /On call/ })).toHaveTextContent(/^Wed–Fri On call$/) // trailing space in the title trimmed
    expect(across.getByRole('button', { name: /Trip/ })).toHaveTextContent(/^Fri–Sat Trip, through Mon Sep 21$/)
    for (const key of ['2026-09-13', '2026-09-16', '2026-09-17']) {
      const day = within(screen.getByTestId(`journal-day-${key}`))
      expect(day.queryByText('Fall break')).toBeNull()
      expect(day.queryByText('On call')).toBeNull()
    }
  })

  it('ticking a day task completes it with an undo that restores the exact prior state', async () => {
    toggleResult.ok = true
    const pushAction = vi.fn()
    const onUpdateTask = vi.fn()
    const tasks = [createMockTask({ id: 'day', title: 'Return library books', scheduledFor: new Date(2026, 8, 14), isAllDay: true })]
    render(<WeekViewV2 {...defaultProps} onUpdateTask={onUpdateTask} pushAction={pushAction} routines={[]} weekStart={sunday} tasks={tasks} />)
    fireEvent.click(within(screen.getByTestId('journal-day-2026-09-14')).getByRole('button', { name: 'Complete Return library books' }))
    await waitFor(() => expect(pushAction).toHaveBeenCalledWith('Task completed', expect.any(Function)))
    pushAction.mock.calls[0][1]()
    expect(onUpdateTask).toHaveBeenCalledWith('day', { completed: false })
  })

  it('offers no "Task completed" undo when the tick failed to save', async () => {
    toggleResult.ok = false
    const pushAction = vi.fn()
    const tasks = [createMockTask({ id: 'day', title: 'Return library books', scheduledFor: new Date(2026, 8, 14), isAllDay: true })]
    render(<WeekViewV2 {...defaultProps} pushAction={pushAction} routines={[]} weekStart={sunday} tasks={tasks} />)
    fireEvent.click(within(screen.getByTestId('journal-day-2026-09-14')).getByRole('button', { name: 'Complete Return library books' }))
    await new Promise((r) => setTimeout(r, 0))
    expect(pushAction).not.toHaveBeenCalled()
    toggleResult.ok = true
  })

  it('keeps routines quiet and honours the Routines switch', () => {
    const routines = [createMockRoutine({ name: 'Morning stretch' })]
    render(<WeekViewV2 {...defaultProps} routines={routines} weekStart={sunday} />)
    expect(screen.getAllByText('Morning stretch').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('switch', { name: 'Routines' }))
    expect(screen.queryByText('Morning stretch')).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'Routines' }))
  })

  // The switch used to run only the daily sweep, so a Sunday-only routine
  // stayed in the journal's "Available" line with routines switched off
  // (Scott, 2026-09-20). Off means none.
  it('the Routines switch also hides an untimed weekly routine from the Available line', () => {
    const routines = [createMockRoutine({ name: 'Take out garbage', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sun'] } as RecurrencePattern })]
    render(<WeekViewV2 {...defaultProps} routines={routines} weekStart={sunday} />)
    expect(screen.queryByText('Take out garbage')).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'Routines' }))
    expect(screen.queryByText('Take out garbage')).toBeNull()
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
      // No side column here either: Planning is a sheet behind its button.
      expect(screen.getByRole('region', { name: "This week's list" })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Shelves' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Shelves' })).toBeNull() // Date header owns the launcher.
    })
  })
})

// Journal | Schedule is presentation only: the same dates, the same data.
describe('WeekViewV2 — Journal and Schedule agree', () => {
  const sunday = new Date(2026, 8, 13)
  beforeEach(() => { instancesMock.rows = []; instancesMock.markDone.mockClear() })

  it('an untimed Saturday placement is a Saturday entry in Journal and sits in Saturday\'s all-day cell in Schedule', () => {
    const tasks = [createMockTask({ id: 'sat', title: 'Organize kids clothes', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 19), plannedOn: new Date(2026, 8, 19) })]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} tasks={tasks} />)
    expect(within(screen.getByTestId('journal-day-2026-09-19')).getByText('Organize kids clothes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))
    expect(within(screen.getByTestId('allday-2026-09-19')).getByText('Organize kids clothes')).toBeInTheDocument()
  })

  it('keeps completed untimed routine occurrences in the day record', async () => {
    instancesMock.rows = [{
      id: 'done', user_id: 'u', entity_type: 'routine', entity_id: 'read', date: '2026-09-19', status: 'completed',
      assignee: null, assigned_to_override: null, deferred_to: null, completed_at: '2026-09-19T12:00:00Z', skipped_at: null, progress: null, created_at: '', updated_at: '',
    }]
    render(<WeekViewV2 {...defaultProps} routines={[createMockRoutine({ id: 'read', name: 'Read', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat'] } })]} weekStart={sunday} />)
    expect(await within(screen.getByTestId('journal-day-2026-09-19')).findByText('Read')).toBeInTheDocument()
  })

  it('a routine occurrence chosen for Saturday (no time) is an entry in both; one nobody chose is only "available"', async () => {
    instancesMock.rows = [{
      id: 'i1', user_id: 'u', entity_type: 'routine', entity_id: 'chosen', date: '2026-09-19', status: 'pending',
      assignee: null, assigned_to_override: null, deferred_to: null, planned_on: '2026-09-19',
      completed_at: null, skipped_at: null, progress: null, created_at: '', updated_at: '',
    }]
    const routines = [
      createMockRoutine({ id: 'chosen', name: 'Family reading time', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
      createMockRoutine({ id: 'waiting', name: 'Kids clean rooms', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={routines} weekStart={sunday} />)
    const saturday = within(screen.getByTestId('journal-day-2026-09-19'))
    const entries = await saturday.findByRole('list', { name: 'Any time entries' })
    expect(within(entries).getByText('Family reading time')).toBeInTheDocument()
    expect(within(entries).queryByText('Kids clean rooms')).toBeNull()
    expect(saturday.queryByLabelText('Available')).toBeNull()
    expect(saturday.queryByText('Kids clean rooms')).toBeNull()

    // Ticking the entry completes THAT occurrence — Saturday's instance.
    fireEvent.click(saturday.getByRole('button', { name: 'Complete Family reading time' }))
    expect(instancesMock.markDone).toHaveBeenCalledWith('routine', 'chosen', new Date(2026, 8, 19))

    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))
    const cell = within(screen.getByTestId('allday-2026-09-19'))
    expect(cell.getByText('Family reading time')).toBeInTheDocument()
    expect(cell.queryByText('Kids clean rooms')).toBeNull()
  })
})
