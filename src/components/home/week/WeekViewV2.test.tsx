import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@/test/test-utils'
import { WeekViewV2 } from './WeekViewV2'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import type { RecurrencePattern } from '@/types/actionable'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { ALL_LAYERS } from '@/lib/domains'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { ConversationWalkContext } from '@/components/canvas/conversationWalk'
import { CanvasActivityProvider, useCanvasActivity } from '@/contexts/CanvasActivityContext'

// These tests cover the Lists view; Open journal is the default since
// 2026-10-08, so they make the device's choice explicit.
beforeEach(() => { localStorage.setItem('symphony-plan-layout.week', 'lists'); localStorage.setItem('symphony-plan-layout.month', 'lists') })


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

// Phones have no bar: the page's own entry sends the walk through the launcher.
const launcher = vi.hoisted(() => ({ openAssistant: vi.fn() }))
vi.mock('@/contexts/AssistantLaunchContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/AssistantLaunchContext')>()),
  useAssistantLauncher: () => launcher,
}))

// The week's planning session, settled and unplanned: "Plan the week" is offered.
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => ({ saved: null, mine: null, loading: false, error: null, reload: vi.fn(), save: vi.fn() }), weekToken: () => 'w' }))

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

// The days are the page (2026-10-12); the shelf opens from the line under the title.

describe('WeekViewV2 layout', () => {
  // Scott, 2026-09-21: the week's viewport is the days. Planning is ONE panel
  // (the dock beside the page), opened from a labelled button, never a
  // second column of lists to understand first.
  it('gives the desktop viewport to the days; the shell owns the task chooser', () => {
    render(<WeekViewV2 {...defaultProps} routines={[]} />)
    // Calendar first (2026-10-12): the days, and no tray.
    expect(screen.getByRole('region', { name: 'The days' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Still to place' })).toBeNull()
    expect(screen.queryByText(/Didn.t happen/)).toBeNull()
    expect(screen.queryByRole('button', { name: /This month/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Shelves' })).not.toBeInTheDocument()
  })

  it('a week task with no day sits in the No day yet line', () => {
    const anchor = weekStartAnchor(monday, readCadenceConfig().weekStartsOn)
    const t = createMockTask({ id: 'w', title: 'Call the plumber', bucket: 'week', weekStart: anchor, commitments: [{ level: 'week', periodStart: anchor, status: 'open' }] })
    render(<WeekViewV2 {...defaultProps} tasks={[t]} routines={[]} />)
    expect(screen.queryByRole('region', { name: 'Still to place' })).toBeNull()
    expect(within(screen.getByRole('list', { name: 'No day yet' })).getByText('Call the plumber')).toBeInTheDocument()
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

  it('keeps specials on a day with no School event, as one chip per kid (ROW-LANGUAGE)', () => {
    const events = [
      mockEvent({ id: 'spc', title: 'Specials — Ella: Library · Kaleb: Art', start: '2026-05-18T07:45:00', end: '2026-05-18T08:00:00' }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} events={events} />)
    expect(screen.getByText('Library').closest('.today-special-chip')).toHaveTextContent('EllaLibrary')
    expect(screen.getByText('Art').closest('.today-special-chip')).toHaveTextContent('KalebArt')
    expect(screen.queryByText('Specials — Ella: Library · Kaleb: Art')).not.toBeInTheDocument()
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
    // On some days, not every day: every-day routines aren't drawn on the
    // week (2026-10-04), so the filter is seen on a day's own routine.
    const someDays = { type: 'weekly', days: ['mon', 'wed'] } as RecurrencePattern
    const routines = [
      createMockRoutine({ name: 'Scott Routine', assigned_to: 'scott', recurrence_pattern: someDays }),
      createMockRoutine({ name: 'Iris Routine', assigned_to: 'iris', recurrence_pattern: someDays }),
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

// ── Journal spread (Scott, 2026-09-19) ──────────────────────────────────────
// Week opens as a seven-day journal: appointments with small times, then the
// day's untimed tasks; multi-day context ruled across the top; the hourly
// grid a switch away.
describe('WeekViewV2 journal spread', () => {
  const sunday = new Date(2026, 8, 13) // Sun Sep 13 – Sat Sep 19, 2026

  it('opens on the days, and has no Days/Hours switch', () => {
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} />)
    expect(screen.getByRole('region', { name: 'The days' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Hours' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Days' })).toBeNull()
    expect(screen.queryByTestId('allday-2026-09-13')).toBeNull()
  })

  it('draws a day as event chips, then its work in time order; done waits behind Show done', () => {
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
    // The week canvas (2026-10-10): events as filled chips with their time,
    // then the day's work as rows, timed first; done hidden until asked.
    const chips = within(monday.getByRole('list', { name: 'Monday events' }))
    expect(chips.getByRole('button', { name: /No school/ })).toBeInTheDocument()
    expect(chips.getByRole('button', { name: /PT appointment/ })).toHaveTextContent('10aPT appointment')
    const rows = () => within(monday.getByRole('list', { name: 'Monday entries' })).getAllByRole('listitem')
      .map((li) => `${li.querySelector('.cw-meta')?.textContent ?? ''}${li.querySelector('.cw-title')?.textContent}`)
    expect(rows()).toEqual(['6:50aGutter quotes', '2:30pCall the bank', 'Return library books', 'Book the plumber'])
    fireEvent.click(screen.getByRole('button', { name: 'Show done' }))
    expect(rows()).toContain('Renew license')
    expect(monday.getByText('Renew license').closest('li')).toHaveClass('is-done')
  })

  it('a day\'s task drags onto another day with the plan payload, and the drop moves it', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 13, 9))
    const onUpdateTask = vi.fn()
    const tasks = [createMockTask({ id: 'a', title: 'List supplies to buy', scheduledFor: new Date(2026, 8, 14, 9), isAllDay: false })]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} tasks={tasks} events={[]} onUpdateTask={onUpdateTask} />)
    vi.useRealTimers()
    const data: Record<string, string> = {}
    const dt = { setData: (k: string, v: string) => { data[k] = v }, getData: (k: string) => data[k] ?? '', types: [] as string[], effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(within(screen.getByTestId('journal-day-2026-09-14')).getByText('List supplies to buy').closest('li')!, { dataTransfer: dt })
    expect(JSON.parse(data['application/x-symphony-plan'])).toEqual({ kind: 'task', id: 'a', date: '2026-09-14', title: 'List supplies to buy' })
    dt.types = Object.keys(data)
    const thursday = screen.getByTestId('journal-day-2026-09-17')
    fireEvent.dragOver(thursday, { dataTransfer: dt })
    expect(within(thursday).getByText('Drop on Thu 17')).toBeInTheDocument()
    fireEvent.drop(thursday, { dataTransfer: dt })
    // A timed task keeps its time on the new day.
    expect(onUpdateTask).toHaveBeenCalledWith('a', { scheduledFor: new Date(2026, 8, 17, 9), isAllDay: false, bucket: 'timed' })
  })

  // Codex, 2026-09-24: the helper supports a dedupe key, but the caller has to
  // pass one. The journal draws the same meeting twice when two calendars
  // report it, so the count must merge what the journal does not.
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

  // The week canvas reports through the activity strip (2026-10-10): Undo
  // writes back the exact prior state, and a failed tick offers none.
  const withActivity = (ui: React.ReactNode) => {
    function Probe() {
      const a = useCanvasActivity()
      return <p data-testid="receipt">{a.receipt ? `${a.receipt.state}:${a.receipt.undoable}` : ''}<button type="button" onClick={() => void a.undo()}>Undo it</button></p>
    }
    return (
      <CanvasActivityProvider snapshot={{ tasks: [], goals: [] }} writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }} refetch={() => {}}>
        {ui}<Probe />
      </CanvasActivityProvider>
    )
  }

  it('ticking a day task completes it with an undo that restores the exact prior state', async () => {
    toggleResult.ok = true
    const onUpdateTask = vi.fn()
    const tasks = [createMockTask({ id: 'day', title: 'Return library books', scheduledFor: new Date(2026, 8, 14), isAllDay: true })]
    render(withActivity(<WeekViewV2 {...defaultProps} onUpdateTask={onUpdateTask} routines={[]} weekStart={sunday} tasks={tasks} />))
    fireEvent.click(within(screen.getByTestId('journal-day-2026-09-14')).getByRole('button', { name: 'Complete Return library books' }))
    await waitFor(() => expect(screen.getByTestId('receipt')).toHaveTextContent('saved:true'))
    fireEvent.click(screen.getByRole('button', { name: 'Undo it' }))
    await waitFor(() => expect(onUpdateTask).toHaveBeenCalledWith('day', { completed: false }))
  })

  it('offers no undo when the tick failed to save', async () => {
    toggleResult.ok = false
    const tasks = [createMockTask({ id: 'day', title: 'Return library books', scheduledFor: new Date(2026, 8, 14), isAllDay: true })]
    render(withActivity(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} tasks={tasks} />))
    fireEvent.click(within(screen.getByTestId('journal-day-2026-09-14')).getByRole('button', { name: 'Complete Return library books' }))
    await waitFor(() => expect(screen.getByTestId('receipt')).toHaveTextContent('failed:false'))
    toggleResult.ok = true
  })

  // Scott, 2026-10-03: routines are always on the week (folded per day); the
  // toolbar switch that hid them all is retired — one routine is hidden with
  // its own "Show in Today and planning".
  it('always shows routines, with no Routines switch', () => {
    const routines = [createMockRoutine({ name: 'Morning stretch', recurrence_pattern: { type: 'weekly', days: ['mon', 'wed'] } as RecurrencePattern })]
    render(<WeekViewV2 {...defaultProps} routines={routines} weekStart={sunday} />)
    expect(screen.getAllByText('Morning stretch').length).toBeGreaterThan(0)
    expect(screen.queryByRole('switch', { name: 'Routines' })).toBeNull()
  })

  // Scott, 2026-10-04: "details pane not loading when i click on … sometime
  // this weekend items". A routine's row id carries its day ('-day0'); the
  // details pane needs the routine's own id.
  it('a routine clicked in the days opens its details by the routine’s own id', () => {
    const onSelectItem = vi.fn()
    const routines = [createMockRoutine({ id: 'wp', name: 'Water houseplants', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sun'] } as RecurrencePattern, show_on_timeline: true })]
    render(<WeekViewV2 {...defaultProps} onSelectItem={onSelectItem} routines={routines} weekStart={sunday} />)
    fireEvent.click(within(screen.getByTestId('journal-day-2026-09-13')).getByRole('button', { name: 'Water houseplants' }))
    expect(onSelectItem).toHaveBeenLastCalledWith('routine-wp')
  })

  // Scott, 2026-09-27: Show in Today ON + due = on the day, untimed, in the
  // journal — as on Today.
  it('a due routine with Show in Today on is a Sunday entry, untimed', () => {
    const routines = [createMockRoutine({ id: 'wp', name: 'Water houseplants', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sun'] } as RecurrencePattern, show_on_timeline: true })]
    render(<WeekViewV2 {...defaultProps} routines={routines} weekStart={sunday} />)
    const sun = within(screen.getByTestId('journal-day-2026-09-13'))
    // A day's own routines read in the day — no fold, no count (2026-10-04).
    expect(within(sun.getByRole('list', { name: 'Sunday entries' })).getByText('Water houseplants')).toBeInTheDocument()
    expect(screen.getAllByText('Water houseplants')).toHaveLength(1)
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
      expect(screen.getByRole('region', { name: 'The days' })).toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: 'Hours' })).toBeNull()
      expect(within(screen.getByTestId('journal-day-2026-09-14')).getByText('Return library books')).toBeInTheDocument()
      // No side column here either, and no tray.
      expect(screen.queryByRole('region', { name: 'Still to place' })).toBeNull()
      expect(screen.queryByRole('dialog', { name: 'Shelves' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Shelves' })).toBeNull() // Date header owns the launcher.
    })
  })
})

// Untimed placements read as entries in their day.
describe('WeekViewV2 — untimed placements', () => {
  const sunday = new Date(2026, 8, 13)
  beforeEach(() => { instancesMock.rows = []; instancesMock.markDone.mockClear() })

  it('an untimed Saturday placement is a Saturday entry', () => {
    const tasks = [createMockTask({ id: 'sat', title: 'Organize kids clothes', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 19), plannedOn: new Date(2026, 8, 19) })]
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} tasks={tasks} />)
    expect(within(screen.getByTestId('journal-day-2026-09-19')).getByText('Organize kids clothes')).toBeInTheDocument()
  })

  it('keeps completed untimed routine occurrences in the day record', async () => {
    instancesMock.rows = [{
      id: 'done', user_id: 'u', entity_type: 'routine', entity_id: 'read', date: '2026-09-19', status: 'completed',
      assignee: null, assigned_to_override: null, deferred_to: null, completed_at: '2026-09-19T12:00:00Z', skipped_at: null, progress: null, created_at: '', updated_at: '',
    }]
    render(<WeekViewV2 {...defaultProps} routines={[createMockRoutine({ id: 'read', name: 'Read', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat'] } })]} weekStart={sunday} />)
    const saturday = within(screen.getByTestId('journal-day-2026-09-19'))
    // Done stays in the day's record, behind the week's one "Show done".
    await waitFor(() => expect(instancesMock.rows.length).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Show done' }))
    expect(await saturday.findByText('Read')).toBeInTheDocument()
    expect(saturday.getByText('Read').closest('li')).toHaveClass('is-done')
  })

  it('a routine occurrence chosen for Saturday (no time) is an entry; one nobody chose is only "available"', async () => {
    instancesMock.rows = [{
      id: 'i1', user_id: 'u', entity_type: 'routine', entity_id: 'chosen', date: '2026-09-19', status: 'pending',
      assignee: null, assigned_to_override: null, deferred_to: null, planned_on: '2026-09-19',
      completed_at: null, skipped_at: null, progress: null, created_at: '', updated_at: '',
    }]
    const routines = [
      createMockRoutine({ id: 'chosen', name: 'Family reading time', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat'] } }),
      // Show in Today not positively set: only available until chosen.
      createMockRoutine({ id: 'waiting', name: 'Kids clean rooms', time_of_day: null, recurrence_pattern: { type: 'weekly', days: ['sat'] }, show_on_timeline: null as unknown as boolean }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={routines} weekStart={sunday} />)
    const saturday = within(screen.getByTestId('journal-day-2026-09-19'))
    const entries = await saturday.findByRole('list', { name: 'Saturday entries' })
    expect(within(entries).getByText('Family reading time')).toBeInTheDocument()
    expect(within(entries).queryByText('Kids clean rooms')).toBeNull()
    expect(saturday.queryByLabelText('Available')).toBeNull()
    expect(saturday.queryByText('Kids clean rooms')).toBeNull()

    // Ticking the entry completes THAT occurrence — Saturday's instance.
    fireEvent.click(saturday.getByRole('button', { name: 'Complete Family reading time' }))
    expect(instancesMock.markDone).toHaveBeenCalledWith('routine', 'chosen', new Date(2026, 8, 19))
  })
})

// Final review 2026-10-03: "Sometime this weekend" must follow the people
// filter like everything else the days draw.
describe('WeekViewV2 — Sometime this weekend follows the people filter', () => {
  it('leaves out a weekend task that belongs to someone not selected', () => {
    const sat = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 5)
    const tasks = [
      createMockTask({ id: 'mine', title: 'Clean the grill', weekendStart: sat, assignedTo: 'scott', bucket: 'week' }),
      createMockTask({ id: 'hers', title: 'Pot the ferns', weekendStart: sat, assignedTo: 'iris', bucket: 'week' }),
    ]
    render(<WeekViewV2 {...defaultProps} routines={[]} tasks={tasks} selectedAssignees={['scott']} />)
    const sometime = within(screen.getByTestId('weekend-sometime'))
    expect(sometime.getByText('Clean the grill')).toBeInTheDocument()
    expect(sometime.queryByText('Pot the ferns')).toBeNull()
  })
})

// Follow-up 2026-10-10: the week page's earlier functions, inside the approved
// composition, writing through the page's own writers.
describe('WeekViewV2 — the week canvas keeps what the page could do', () => {
  const sunday = new Date(2026, 8, 13)
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 13, 9)) })
  afterEach(() => { vi.useRealTimers(); localStorage.removeItem('symphony-week-daily') })

  it('has no Plan the week session button, no steps; planning starts in the conversation', () => {
    render(
      <ConversationWalkContext.Provider value={vi.fn()}>
        <WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} />
      </ConversationWalkContext.Provider>,
    )
    expect(screen.queryByRole('button', { name: 'Plan the week' })).toBeNull()
    expect(screen.queryByText(/Step \d of 8/)).toBeNull()
    expect(screen.queryByRole('region', { name: /Planning week/ })).toBeNull()
  })

  it('on a phone (no bar) the page offers the same walk and sends the same message', () => {
    launcher.openAssistant.mockClear()
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} />)
    fireEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
    expect(launcher.openAssistant).toHaveBeenCalledWith({ message: 'Plan the week.', autoSend: true })
  })

  it('every-day routines are written once until "Show daily", which is remembered', () => {
    const daily = createMockRoutine({ id: 'dog', name: 'Walk the dog', time_of_day: '07:00:00', recurrence_pattern: { type: 'daily' } as RecurrencePattern, show_on_timeline: true })
    render(<WeekViewV2 {...defaultProps} routines={[daily]} weekStart={sunday} />)
    expect(screen.getAllByText('Walk the dog')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Show daily' }))
    expect(localStorage.getItem('symphony-week-daily')).toBe('shown')
    expect(screen.getAllByText('Walk the dog').length).toBeGreaterThan(1)
    expect(screen.getByRole('button', { name: 'Hide daily' })).toBeInTheDocument()
  })
})

// Task 12: the walk sits in the conversation bar on the current week. The
// household's week starts on Saturday.
describe('WeekViewV2 — Plan the rest of my week in the bar', () => {
  beforeEach(() => {
    localStorage.setItem('symphony-cadence-config', JSON.stringify({ weekStartsOn: 6 }))
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => { vi.useRealTimers(); localStorage.removeItem('symphony-cadence-config') })

  const mount = (weekStart: Date, setWalk = vi.fn()) => {
    render(
      <ConversationWalkContext.Provider value={setWalk}>
        <WeekViewV2 {...defaultProps} routines={[]} weekStart={weekStart} />
      </ConversationWalkContext.Provider>,
    )
    return setWalk
  }

  it('offers "Plan the rest of my week" mid-week', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    const setWalk = mount(new Date(2026, 9, 10))
    expect(setWalk).toHaveBeenCalledWith({ label: 'Plan the rest of my week', message: 'Plan the rest of my week.' })
  })

  it('offers "Plan the week" on the week\'s first day', () => {
    vi.setSystemTime(new Date(2026, 9, 10, 9))
    const setWalk = mount(new Date(2026, 9, 10))
    expect(setWalk).toHaveBeenCalledWith({ label: 'Plan the week', message: 'Plan the week.' })
  })

  it('offers no in-page button when the bar carries the walk', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    mount(new Date(2026, 9, 10))
    expect(screen.queryByRole('button', { name: /^Plan (the rest of my|the) week$/ })).toBeNull()
  })

  it('on a phone mid-week the page offers "Plan the rest of my week"', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    launcher.openAssistant.mockClear()
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={new Date(2026, 9, 10)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Plan the rest of my week' }))
    expect(launcher.openAssistant).toHaveBeenCalledWith({ message: 'Plan the rest of my week.', autoSend: true })
  })

  it('offers nothing on another week', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    const setWalk = mount(new Date(2026, 9, 3))
    expect(screen.queryByRole('button', { name: /^Plan (the rest of my|the) week$/ })).toBeNull()
    expect(setWalk).not.toHaveBeenCalledWith(expect.objectContaining({ label: expect.any(String) }))
  })
})
