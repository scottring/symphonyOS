import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest'
import { render, screen, within, fireEvent, waitFor, act, cleanup } from '@/test/test-utils'
import { WeekViewV2 } from './WeekViewV2'
import { useSearchParams } from 'react-router-dom'
import { staleForDrain } from '@/lib/planning/drain'
import { createMockRoutine, createMockTask } from '@/test/mocks/factories'
import type { Task } from '@/types/task'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import type { RecurrencePattern } from '@/types/actionable'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { ALL_LAYERS } from '@/lib/domains'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import { ConversationWalkContext } from '@/components/canvas/conversationWalk'
import { CanvasActivityProvider, useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { WEEK_PREF_KEYS } from '@/hooks/useWeekViewPrefs'

// These tests cover the Lists view; Open journal is the default since
// 2026-10-08, so they make the device's choice explicit.
beforeEach(() => { localStorage.setItem('symphony-plan-layout.week', 'lists'); localStorage.setItem('symphony-plan-layout.month', 'lists') })
// The Week page's view choices (useWeekViewPrefs) are per device: none leaks between tests.
afterEach(() => { for (const k of Object.values(WEEK_PREF_KEYS)) localStorage.removeItem(k) })


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

// The assistant launcher, stubbed: the page draws no walk entry of its own (calm pass 2).
const launcher = vi.hoisted(() => ({ openAssistant: vi.fn() }))
vi.mock('@/contexts/AssistantLaunchContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/AssistantLaunchContext')>()),
  useAssistantLauncher: () => launcher,
}))

// The week's planning session, settled and unplanned: "Help me plan the week" is offered.
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => ({ saved: null, mine: null, loading: false, error: null, reload: vi.fn(), save: vi.fn() }), weekToken: (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }))

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

// The deck (Friday session, Stage 1): its props are what these tests read, and
// its writers are spies — the deck's own behaviour is Deck.test's.
const deckMock = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock('@/components/plan/deck/Deck', () => ({
  Deck: (props: Record<string, unknown>) => { deckMock.props = props; return <div data-testid="deck" data-mode={String(props.mode)} /> },
}))
const deckActions = vi.hoisted(() => ({
  done: vi.fn(async () => true), placeOnDay: vi.fn(async () => true), keepThisWeek: vi.fn(async () => true),
  later: vi.fn(async () => true), laterOnDate: vi.fn(async () => true), letGo: vi.fn(async () => true), drain: vi.fn(async () => true),
}))
vi.mock('@/components/home/week/useDeckActions', () => ({ useDeckActions: () => deckActions }))
// Each instance keeps its own state, as the real hook does: a finish through
// one instance is seen only by whoever reads that instance.
const periodReview = vi.hoisted(() => ({ token: '' as string, reviewed: null as null | { at: Date }, finish: vi.fn(async () => true) }))
vi.mock('@/hooks/usePeriodReview', async () => {
  const { useState } = await import('react')
  return {
    usePeriodReview: (_h: string, token: string) => {
      const [reviewed, setReviewed] = useState(periodReview.reviewed)
      return { reviewed, mine: null, loading: false, error: null, reload: () => {},
        finish: async (notes: unknown) => {
          periodReview.token = token
          const ok = await periodReview.finish(notes)
          if (ok) setReviewed({ at: new Date() })
          return ok
        } }
    },
  }
})
// Who is looking (the deck's people scope); unset, the hook's own answer.
const viewer = vi.hoisted(() => ({ me: null as null | { id: string } }))
vi.mock('@/hooks/useFamilyMembers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useFamilyMembers')>()
  return {
    ...actual,
    useFamilyMembers: () => {
      const real = actual.useFamilyMembers()
      return viewer.me ? { ...real, getCurrentUserMember: () => viewer.me } : real
    },
  }
})

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

// A phone-width screen (useMediaQuery reads matchMedia), for this test only.
function asPhone() {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width: 767px'), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  onTestFinished(() => { window.matchMedia = original })
}

// The page's view choices live in the header's ⋯ menu (calm pass 2).
function turnOn(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
  const item = screen.getByRole('menuitemcheckbox', { name })
  fireEvent.click(item)
  return item
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

  it('a week task with no day is counted, not listed', () => {
    const anchor = weekStartAnchor(monday, readCadenceConfig().weekStartsOn)
    const t = createMockTask({ id: 'w', title: 'Call the plumber', bucket: 'week', weekStart: anchor, commitments: [{ level: 'week', periodStart: anchor, status: 'open' }] })
    render(<WeekViewV2 {...defaultProps} tasks={[t]} routines={[]} />)
    expect(screen.queryByRole('region', { name: 'Still to place' })).toBeNull()
    expect(screen.queryByText('Call the plumber')).toBeNull()
    expect(screen.getByText('1 without a day')).toBeInTheDocument()
    // This week is not the current one, so the deck may not open here: no link, no progress line.
    expect(screen.queryByRole('button', { name: 'Place them' })).toBeNull()
    expect(screen.queryByText(/done last week/)).toBeNull()
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

  it('draws a day as event chips, then its work in time order; done waits behind Show done (⋯)', () => {
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
    // Calm pass 2 (foldDay): the calendar events and two things, timed or
    // not; the rest wait behind "+N more".
    expect(rows()).toEqual(['6:50aGutter quotes', '2:30pCall the bank'])
    expect(monday.getByRole('button', { name: '+2 more' })).toBeInTheDocument()
    turnOn('Show done')
    expect(rows()).not.toContain('Renew license')
    fireEvent.click(monday.getByRole('button', { name: '+3 more' }))
    expect(rows()).toEqual(['6:50aGutter quotes', '2:30pCall the bank', 'Return library books', 'Book the plumber', 'Renew license'])
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
    turnOn('Show done')
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

  it.each(['not-connected', 'loading', 'stale', 'error', undefined] as const)('does not claim open calendar time when coverage is %s', (events) => {
    localStorage.setItem(WEEK_PREF_KEYS.freeTime, 'shown')
    const { rerender } = render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday}
      sources={{ tasks: 'ready', routines: 'ready', events: 'ready' }} />)
    expect(screen.getAllByText('Calendar clear all day').length).toBeGreaterThan(0)
    rerender(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday}
      sources={events ? { tasks: 'ready', routines: 'ready', events } : undefined} />)
    expect(screen.queryByText(/Calendar clear/)).not.toBeInTheDocument()
  })

  // Calm pass 2: the Chat bar carries the planning conversation; the page
  // draws no entry of its own, and no wizard.
  it('hands the planning conversation to the Chat bar, with no page entry and no wizard', () => {
    const setWalk = vi.fn()
    render(
      <ConversationWalkContext.Provider value={setWalk}>
        <WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} />
      </ConversationWalkContext.Provider>,
    )
    expect(setWalk).toHaveBeenCalledWith({ label: 'Help me plan the week', message: 'Help me plan the week.' })
    expect(screen.queryByRole('button', { name: /^Help me plan/ })).toBeNull()
    expect(screen.queryByText(/Step \d of 8/)).toBeNull()
    expect(screen.queryByRole('region', { name: /Planning week/ })).toBeNull()
  })

  it('free time is off by default, even with the whole calendar loaded', () => {
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sunday} sources={{ tasks: 'ready', routines: 'ready', events: 'ready' }} />)
    expect(screen.queryByText(/Calendar clear/)).not.toBeInTheDocument()
  })

  it('every-day routines are written once until "Show daily routines in each day" (⋯), which is remembered', () => {
    const daily = createMockRoutine({ id: 'dog', name: 'Walk the dog', time_of_day: '07:00:00', recurrence_pattern: { type: 'daily' } as RecurrencePattern, show_on_timeline: true })
    render(<WeekViewV2 {...defaultProps} routines={[daily]} weekStart={sunday} />)
    // Written once, with its time (rhythmLines).
    expect(screen.getAllByText(/Walk the dog/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: '7a Walk the dog' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Show|Hide) daily$/ })).toBeNull()
    const item = turnOn('Show daily routines in each day')
    expect(localStorage.getItem('symphony-week-daily')).toBe('shown')
    expect(screen.getAllByText('Walk the dog').length).toBeGreaterThan(1)
    expect(item).toHaveAttribute('aria-checked', 'true')
  })

  // Calm pass 2: a repeat on Mon–Thu folds once, labelled with its days;
  // "Show daily" puts it back in each day.
  it('a Mon–Thu routine is written once as "Mon–Thu" until "Show daily routines in each day"', () => {
    const home = createMockRoutine({ id: 'home', name: 'Home from school', time_of_day: '17:45:00', recurrence_pattern: { type: 'weekly', days: ['mon', 'tue', 'wed', 'thu'] } as RecurrencePattern, show_on_timeline: true })
    render(<WeekViewV2 {...defaultProps} routines={[home]} weekStart={sunday} />)
    expect(screen.getByText('Mon–Thu')).toBeInTheDocument()
    expect(screen.getAllByText(/Home from school/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: '5:45p Home from school' })).toBeInTheDocument()
    turnOn('Show daily routines in each day')
    expect(screen.getAllByText('Home from school')).toHaveLength(4)
  })
})

// Task 12: the walk sits in the conversation bar on the current week. The
// household's week starts on Saturday.
describe('WeekViewV2 — Help me plan the rest of my week in the bar', () => {
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

  it('offers "Help me plan the rest of my week" mid-week', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    const setWalk = mount(new Date(2026, 9, 10))
    expect(setWalk).toHaveBeenCalledWith({ label: 'Help me plan the rest of my week', message: 'Help me plan the rest of my week.' })
  })

  it('offers "Help me plan the week" on the week\'s first day', () => {
    vi.setSystemTime(new Date(2026, 9, 10, 9))
    const setWalk = mount(new Date(2026, 9, 10))
    expect(setWalk).toHaveBeenCalledWith({ label: 'Help me plan the week', message: 'Help me plan the week.' })
  })

  // Calm pass 2: the page no longer draws the entry; the Chat bar has it.
  // Fix round 1: phones have no Chat bar, so there the ⋯ menu carries
  // "Talk it through", which starts the same walk. The desk has no such item.
  it('on a phone, ⋯ "Talk it through" starts the walk mid-week; the desk has no such item', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    mount(new Date(2026, 9, 10))
    expect(screen.queryByRole('button', { name: 'Help me plan the rest of my week' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    expect(screen.queryByRole('menuitem', { name: 'Talk it through' })).toBeNull()
    cleanup()
    asPhone()
    launcher.openAssistant.mockClear()
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={new Date(2026, 9, 10)} />)
    expect(screen.queryByRole('button', { name: 'Help me plan the rest of my week' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Talk it through' }))
    expect(launcher.openAssistant).toHaveBeenCalledWith({ message: 'Help me plan the rest of my week.', autoSend: true })
  })

  it('offers nothing on a past week', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    const setWalk = mount(new Date(2026, 9, 3))
    expect(screen.queryByRole('button', { name: /^Help me plan (the rest of my|the) week$/ })).toBeNull()
    expect(setWalk).not.toHaveBeenCalledWith(expect.objectContaining({ label: expect.any(String) }))
  })

  // Final review 2026-10-14 #4: Friday is the Saturday-start week's last day,
  // when the household plans the next one.
  it('on the week\'s last day offers planning the next week, by its start date', () => {
    vi.setSystemTime(new Date(2026, 9, 16, 18))
    const setWalk = mount(new Date(2026, 9, 10))
    expect(setWalk).toHaveBeenCalledWith({ label: 'Help me plan week 43', message: 'Help me plan the week of Oct 17.' })
    expect(setWalk).not.toHaveBeenCalledWith(expect.objectContaining({ label: 'Help me plan the rest of my week' }))
  })

  it('on the last day a phone talks through next week from ⋯, and the note points there', () => {
    vi.setSystemTime(new Date(2026, 9, 16, 18))
    asPhone()
    launcher.openAssistant.mockClear()
    render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={new Date(2026, 9, 10)} />)
    expect(screen.queryByRole('button', { name: 'Help me plan week 43' })).toBeNull()
    expect(screen.getByText(/ends today/).closest('.pv2-endsweek')?.textContent).toMatch(/Talk it through.*⋯/)
    expect(screen.queryByText(/Open Chat/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Week options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Talk it through' }))
    expect(launcher.openAssistant).toHaveBeenCalledWith({ message: 'Help me plan the week of Oct 17.', autoSend: true })
  })

  it('next week\'s page offers "Help me plan the week", naming its start', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    const setWalk = mount(new Date(2026, 9, 17))
    expect(setWalk).toHaveBeenCalledWith({ label: 'Help me plan the week', message: 'Help me plan the week of Oct 17.' })
  })

  // Final review 2026-10-14 #5: the line said false things while loading.
  // Calm pass 2: the fact line keeps only "Today: {first item}".
  it('says "Today: {first item}" in the fact line only once the tasks and calendar have loaded', () => {
    vi.setSystemTime(new Date(2026, 9, 14, 9))
    const events = [mockEvent({ id: 'bb', title: 'Kaleb’s baseball', start: '2026-10-14T17:00:00', end: '2026-10-14T18:30:00' })]
    const loading = { tasks: 'ready' as const, events: 'loading' as const, routines: 'ready' as const }
    const { rerender } = render(<WeekViewV2 {...defaultProps} routines={[]} events={events} weekStart={new Date(2026, 9, 10)} sources={loading} />)
    expect(screen.queryByText(/Today:/)).toBeNull()
    rerender(<WeekViewV2 {...defaultProps} routines={[]} events={events} weekStart={new Date(2026, 9, 10)} sources={{ ...loading, tasks: 'loading' }} />)
    expect(screen.queryByText(/Today:/)).toBeNull()
    rerender(<WeekViewV2 {...defaultProps} routines={[]} events={events} weekStart={new Date(2026, 9, 10)} sources={{ ...loading, events: 'ready' }} />)
    const line = document.querySelector('.wk-facts')
    expect(line?.textContent).toMatch(/ · Today: Kaleb’s baseball$/)
    expect(line?.textContent).not.toMatch(/wide open|full one/)
    expect(document.querySelector('.wc-week-sentence')).toBeNull()
  })
})


describe('Chat drafts and the saved week', () => {
  it('keeps proposed additions and moves off the week, then draws saved rows immediately', () => {
    const start = new Date(2026, 9, 11)
    const gate = createMockTask({ id: 'gate', title: 'Fix the gate latch', scheduledFor: new Date(2026, 9, 16), isAllDay: true })
    const draft: ChangeSet = { key: 'review', title: '2 changes', ops: [
      { key: 'shower', op: 'add', title: 'Shower', date: '2026-10-15', time: '15:00' },
      { key: 'gate', op: 'place', taskId: 'gate', title: gate.title, date: '2026-10-17' },
    ] }
    function DraftControl() {
      const activity = useCanvasActivity()
      return <button onClick={() => activity.setChangeSet(draft)}>Prepare draft</button>
    }
    const scene = (tasks: Task[]) => <CanvasActivityProvider snapshot={{ tasks, goals: [] }} writers={{ deleteTask: vi.fn(), updateTask: vi.fn(), deleteGoal: vi.fn(), updateGoal: vi.fn() }} refetch={() => {}}>
      <DraftControl />
      <WeekViewV2 {...defaultProps} tasks={tasks} routines={[]} weekStart={start} />
    </CanvasActivityProvider>
    const view = render(scene([gate]))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare draft' }))
    expect(screen.queryByText('Shower')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('journal-day-2026-10-16')).getByText(gate.title)).toBeInTheDocument()
    expect(within(screen.getByTestId('journal-day-2026-10-17')).queryByText(gate.title)).not.toBeInTheDocument()

    // Stored data arrives before the draft is cleared. It must render once,
    // in the right day, without waiting for a timer or another network event.
    const shower = createMockTask({ id: 'shower', title: 'Shower', scheduledFor: new Date(2026, 9, 15, 15), isAllDay: false })
    view.rerender(scene([shower, { ...gate, scheduledFor: new Date(2026, 9, 17) }]))
    expect(screen.getAllByText('Shower')).toHaveLength(1)
    expect(within(screen.getByTestId('journal-day-2026-10-15')).getByText('Shower')).toBeInTheDocument()
    expect(within(screen.getByTestId('journal-day-2026-10-16')).queryByText(gate.title)).not.toBeInTheDocument()
    expect(within(screen.getByTestId('journal-day-2026-10-17')).getByText(gate.title)).toBeInTheDocument()
    view.rerender(scene([gate]))
    expect(screen.queryByText('Shower')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('journal-day-2026-10-16')).getByText(gate.title)).toBeInTheDocument()
  })
})

// ── The deck, wired into the Week (Friday session, Stage 1, Task 6) ─────────
// The household's week starts on Saturday: this week is Sat Oct 17 – Fri Oct
// 23, 2026, so last week is Sat Oct 10 – Fri Oct 16.
describe('WeekViewV2 — the deck', () => {
  const sat = new Date(2026, 9, 17)
  const now = new Date(2026, 9, 17, 9)
  const recent = new Date(2026, 9, 15)
  const old = new Date(2026, 8, 1)
  const familyOnly = new Set(['family']) as unknown as typeof ALL_LAYERS
  type DeckProps = {
    cards: { key: string; source: string; serves?: string }[]
    doneLastWeek: number
    aged: number
    mode: 'full' | 'place'
    stripDays: { key: string; date: Date; label: string; isWeekend: boolean; lines: string[]; more: number }[]
    onFinish: (decided: ReadonlySet<string>) => void
    onExit: () => void
    onSeeAged: () => void
  }
  const props = () => deckMock.props as unknown as DeckProps

  beforeEach(() => {
    localStorage.setItem('symphony-cadence-config', JSON.stringify({ weekStartsOn: 6 }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    deckMock.props = null
    Object.values(deckActions).forEach((f) => f.mockClear())
    periodReview.finish.mockClear()
    periodReview.token = ''
    periodReview.reviewed = null
    viewer.me = null
  })
  afterEach(() => {
    vi.useRealTimers()
    localStorage.removeItem('symphony-cadence-config')
    localStorage.removeItem('symphony-assignee-filter-v2')
    window.history.replaceState({}, '', '/')
  })

  const open = (query: string, tasks: Task[], extra: Partial<React.ComponentProps<typeof WeekViewV2>> = {}) => {
    window.history.replaceState({}, '', `/week${query}`)
    return render(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sat} tasks={tasks} {...extra} />)
  }

  // Review Focus 1: a Family view never deals, counts or drains a private task.
  it('with Family only, a private Work task is neither dealt nor counted as done last week', () => {
    const tasks = [
      createMockTask({ id: 'famOpen', title: 'Fix the gate', context: 'family', scheduledFor: new Date(2026, 9, 12), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'workOpen', title: 'Board deck', context: 'work', scheduledFor: new Date(2026, 9, 13), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'famDone', title: 'Book the vet', context: 'family', scheduledFor: new Date(2026, 9, 12), isAllDay: true, completed: true, updatedAt: recent }),
      createMockTask({ id: 'workDone', title: 'Quarterly numbers', context: 'work', scheduledFor: new Date(2026, 9, 14), isAllDay: true, completed: true, updatedAt: recent }),
      createMockTask({ id: 'workInbox', title: 'Old work idea', context: 'work', bucket: 'inbox', updatedAt: old }),
    ]
    open('?review=1', tasks, { layers: familyOnly })
    expect(screen.getByTestId('deck')).toHaveAttribute('data-mode', 'full')
    expect(props().cards.map((c) => c.key)).toEqual(['famOpen'])
    expect(props().doneLastWeek).toBe(1)
    // The drain is scoped the same way: the private inbox capture stays put.
    expect(deckActions.drain).not.toHaveBeenCalled()
    expect(props().aged).toBe(0)
  })

  // I2: with nobody chosen, the deck is what the Week list shows the viewer.
  it('in the everyone view, a task assigned only to Iris is neither dealt, counted nor drained', async () => {
    viewer.me = { id: 'scott' }
    const tasks = [
      createMockTask({ id: 'mine', title: 'Fix the gate', assignedTo: 'scott', scheduledFor: new Date(2026, 9, 12), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'hers', title: 'Pot the ferns', assignedTo: 'iris', scheduledFor: new Date(2026, 9, 13), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'hersDone', title: 'Book the vet', assignedTo: 'iris', scheduledFor: new Date(2026, 9, 13), isAllDay: true, completed: true, updatedAt: recent }),
      createMockTask({ id: 'staleHers', title: 'Old idea of hers', assignedTo: 'iris', bucket: 'inbox', updatedAt: old }),
      createMockTask({ id: 'staleShared', title: 'Old shared idea', bucket: 'inbox', updatedAt: old }),
    ]
    open('?review=1', tasks)
    expect(props().cards.map((c) => c.key)).toEqual(['mine', 'staleShared'])
    expect(props().doneLastWeek).toBe(0)
    expect(deckActions.drain).toHaveBeenCalledTimes(1)
    expect((deckActions.drain.mock.calls[0] as unknown as [Task[]])[0].map((t) => t.id)).toEqual(['staleShared'])
    await act(async () => { await props().onFinish(new Set()) })
    expect(deckActions.drain).toHaveBeenCalledTimes(2)
    expect((deckActions.drain.mock.calls[1] as unknown as [Task[]])[0].map((t) => t.id)).toEqual(['mine'])
  })

  // Choosing Iris shows her tasks, but the drains still never move them.
  it('with Iris chosen her cards are dealt, but neither drain moves a task only she carries', async () => {
    viewer.me = { id: 'scott' }
    localStorage.setItem('symphony-assignee-filter-v2', JSON.stringify(['iris']))
    const tasks = [
      createMockTask({ id: 'hers', title: 'Pot the ferns', assignedTo: 'iris', scheduledFor: new Date(2026, 9, 13), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'staleHers', title: 'Old idea of hers', assignedTo: 'iris', bucket: 'inbox', updatedAt: old }),
    ]
    open('?review=1', tasks)
    // Not drained, so her old capture is still an Inbox card here.
    expect(props().cards.map((c) => c.key)).toEqual(['hers', 'staleHers'])
    expect(deckActions.drain).not.toHaveBeenCalled()
    expect(props().aged).toBe(0)
    await act(async () => { await props().onFinish(new Set()) })
    expect(deckActions.drain).not.toHaveBeenCalled()
    expect(periodReview.finish).toHaveBeenCalledTimes(1)
  })

  it('opening the full deck drains what is stale once, and says how many', async () => {
    const tasks = [
      createMockTask({ id: 'stale', title: 'Old capture', context: 'family', bucket: 'inbox', updatedAt: old }),
      createMockTask({ id: 'fresh', title: 'New capture', context: 'family', bucket: 'inbox', updatedAt: recent }),
      createMockTask({ id: 'staleWork', title: 'Old work capture', context: 'work', bucket: 'inbox', updatedAt: old }),
    ]
    const view = open('?review=1', tasks, { layers: familyOnly })
    expect(deckActions.drain).toHaveBeenCalledTimes(1)
    expect(deckActions.drain).toHaveBeenCalledWith(staleForDrain([tasks[0], tasks[1]], now))
    expect((deckActions.drain.mock.calls[0] as unknown as [Task[]])[0].map((t) => t.id)).toEqual(['stale'])
    await waitFor(() => expect(props().aged).toBe(1))
    view.rerender(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sat} tasks={[...tasks]} layers={familyOnly} />)
    expect(deckActions.drain).toHaveBeenCalledTimes(1)
    expect(props().aged).toBe(1)
  })

  it('waits for the tasks to load before it deals or drains', () => {
    const tasks = [createMockTask({ id: 'stale', title: 'Old capture', bucket: 'inbox', updatedAt: old })]
    const loading = { tasks: 'loading' as const, events: 'ready' as const, routines: 'ready' as const }
    const view = open('?review=1', [], { sources: loading })
    expect(screen.queryByTestId('deck')).toBeNull()
    expect(deckActions.drain).not.toHaveBeenCalled()
    view.rerender(<WeekViewV2 {...defaultProps} routines={[]} weekStart={sat} tasks={tasks} sources={{ ...loading, tasks: 'ready' }} />)
    expect(screen.getByTestId('deck')).toBeInTheDocument()
    expect(deckActions.drain).toHaveBeenCalledTimes(1)
  })

  it('?plan=1 opens the same full deck; nothing stale, nothing drained', () => {
    open('?plan=1', [createMockTask({ id: 'fresh', bucket: 'inbox', updatedAt: recent })])
    expect(screen.getByTestId('deck')).toHaveAttribute('data-mode', 'full')
    expect(deckActions.drain).not.toHaveBeenCalled()
    expect(props().aged).toBe(0)
  })

  // Review Focus 2: last week, the strip's order and its weekend follow weekStartsOn.
  it('in a Saturday week, last week starts the Saturday before and the strip runs Sat → Fri', () => {
    const tasks = [
      createMockTask({ id: 'lastSat', title: 'Mow', scheduledFor: new Date(2026, 9, 10), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'prevFri', title: 'Too old', scheduledFor: new Date(2026, 9, 9), isAllDay: true, updatedAt: recent }),
    ]
    open('?review=1', tasks)
    expect(props().cards.map((c) => [c.key, c.source])).toEqual([['lastSat', 'last-week']])
    const days = props().stripDays
    expect(days).toHaveLength(7)
    expect(days.map((d) => d.date.getDate())).toEqual([17, 18, 19, 20, 21, 22, 23])
    expect(days.map((d) => d.isWeekend)).toEqual([true, true, false, false, false, false, false])
    expect(days[0].label).toBe('Sat 17')
  })

  it('each strip day lists up to three timed events and tasks by time, and counts the rest', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 19, h, m)
    const tasks = [
      createMockTask({ id: 'bank', title: 'Call the bank', scheduledFor: at(8), isAllDay: false, updatedAt: recent }),
      createMockTask({ id: 'books', title: 'Library books', scheduledFor: new Date(2026, 9, 19), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'tue', title: 'Tuesday thing', scheduledFor: new Date(2026, 9, 20, 10), isAllDay: false, updatedAt: recent }),
    ]
    const events = [
      mockEvent({ id: 'dent', title: 'Dentist', start: '2026-10-19T14:00:00', end: '2026-10-19T15:00:00' }),
      mockEvent({ id: 'swim', title: 'Swim', start: '2026-10-19T09:00:00', end: '2026-10-19T10:00:00' }),
      mockEvent({ id: 'pt', title: 'PT', start: '2026-10-19T16:00:00', end: '2026-10-19T17:00:00' }),
    ]
    open('?review=1', tasks, { events })
    const monday = props().stripDays[2]
    expect(monday.lines).toEqual(['Call the bank', 'Swim', 'Dentist'])
    expect(monday.more).toBe(2)
    expect(props().stripDays[3].lines).toEqual(['Tuesday thing'])
    expect(props().stripDays[3].more).toBe(0)
    expect(props().stripDays[0].lines).toEqual([])
  })

  it('a card says which month goal it serves', () => {
    const goal = createMockTask({ id: 'g', title: 'Get the house ready for winter', isGoal: true, bucket: 'month', monthStart: new Date(2026, 9, 1), updatedAt: recent })
    const step = createMockTask({ id: 's', title: 'Clean the gutters', bucket: 'week', weekStart: sat, goalTaskId: 'g', commitments: [{ level: 'week', periodStart: sat, status: 'open' }], updatedAt: recent })
    open('?review=1', [goal, step])
    expect(props().cards).toEqual([expect.objectContaining({ key: 's', source: 'this-week', serves: 'For October · Get the house ready for winter' })])
  })

  it('finishing the full deck sends what was left from last week to Later in one go, then records last week reviewed', async () => {
    const tasks = [
      createMockTask({ id: 'a', title: 'Fix the gate', scheduledFor: new Date(2026, 9, 12), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'b', title: 'Paint the shed', scheduledFor: new Date(2026, 9, 13), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'c', title: 'New capture', bucket: 'inbox', updatedAt: recent }),
    ]
    open('?review=1', tasks)
    await act(async () => { await props().onFinish(new Set(['a'])) })
    expect(deckActions.drain).toHaveBeenCalledTimes(1)
    expect((deckActions.drain.mock.calls[0] as unknown as [Task[]])[0].map((t) => t.id)).toEqual(['b'])
    expect(deckActions.later).not.toHaveBeenCalled()
    expect(periodReview.finish).toHaveBeenCalledWith({ wentWell: '', didnt: '' })
    expect(periodReview.token).toBe('2026-10-10')
    expect(deckActions.drain.mock.invocationCallOrder[0]).toBeLessThan(periodReview.finish.mock.invocationCallOrder[0])
    await waitFor(() => expect(screen.queryByTestId('deck')).toBeNull())
    expect(new URLSearchParams(window.location.search).get('review')).toBeNull()
  })

  it('the end drain is labelled for what it moves, and leaves a last-week task due today', async () => {
    const tasks = [
      createMockTask({ id: 'b', title: 'Paint the shed', scheduledFor: new Date(2026, 9, 13), isAllDay: true, updatedAt: recent }),
      // Committed to last week, but given today: it still has a home.
      createMockTask({ id: 'today', title: 'Pick up the cake', bucket: 'week', weekStart: new Date(2026, 9, 10), scheduledFor: new Date(2026, 9, 17), isAllDay: true,
        commitments: [{ level: 'week', periodStart: new Date(2026, 9, 10), status: 'open' }], updatedAt: recent }),
    ]
    open('?review=1', tasks)
    expect(props().cards.map((c) => c.key)).toEqual(expect.arrayContaining(['b', 'today']))
    await act(async () => { await props().onFinish(new Set()) })
    expect(deckActions.drain).toHaveBeenCalledTimes(1)
    const [moved, label] = deckActions.drain.mock.calls[0] as unknown as [Task[], string]
    expect(moved.map((t) => t.id)).toEqual(['b'])
    expect(label).toBe('Move 1 left from last week to Later')
  })

  it('an end drain that fails records no review and keeps the deck open', async () => {
    open('?review=1', [createMockTask({ id: 'b', title: 'Paint the shed', scheduledFor: new Date(2026, 9, 13), isAllDay: true, updatedAt: recent })])
    deckActions.drain.mockResolvedValueOnce(false)
    await act(async () => { await props().onFinish(new Set()) })
    expect(deckActions.drain).toHaveBeenCalledTimes(1)
    expect(periodReview.finish).not.toHaveBeenCalled()
    expect(screen.getByTestId('deck')).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('review')).toBe('1')
  })

  // Controller ruling: the deck reviews the week that is ending, opened from the
  // week after it — so only this week, and next week on this week's last day.
  it('ignores the deck on a past week, and on next week before this week’s last day', () => {
    const stale = createMockTask({ id: 'stale', title: 'Old capture', bucket: 'inbox', updatedAt: old })
    const view = open('?review=1', [stale], { weekStart: new Date(2026, 9, 10) })
    expect(screen.queryByTestId('deck')).toBeNull()
    expect(screen.getByRole('region', { name: 'The days' })).toBeInTheDocument()
    view.unmount()
    open('?plan=1', [stale], { weekStart: new Date(2026, 9, 24) })
    expect(screen.queryByTestId('deck')).toBeNull()
    cleanup()
    open('?place=1', [stale], { weekStart: new Date(2026, 9, 3) })
    expect(screen.queryByTestId('deck')).toBeNull()
    expect(deckActions.drain).not.toHaveBeenCalled()
  })

  // Fix round 1 ruling: the last day's one button reads "Plan next week".
  it('on this week’s last day, Plan next week opens the deck on next week; finishing records this week and stays there', async () => {
    vi.setSystemTime(new Date(2026, 9, 23, 18)) // Friday, the last day of the week of Oct 17
    // The page's week follows the URL's date, as HomeView's does.
    function Page() {
      const [p] = useSearchParams()
      const d = p.get('date')
      const asked = d ? new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) : sat
      return <WeekViewV2 {...defaultProps} routines={[]} weekStart={weekStartAnchor(asked, 6)}
        tasks={[createMockTask({ id: 'b', title: 'Paint the shed', scheduledFor: new Date(2026, 9, 20), isAllDay: true, updatedAt: new Date(2026, 9, 20) })]} />
    }
    window.history.replaceState({}, '', '/week')
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'Plan next week' }))
    expect(screen.getByTestId('deck')).toHaveAttribute('data-mode', 'full')
    expect(document.querySelector('.pv2-week')).toHaveAttribute('data-week', '2026-10-24')
    expect(props().cards.map((c) => [c.key, c.source])).toEqual([['b', 'last-week']])
    await act(async () => { await props().onFinish(new Set()) })
    expect(periodReview.finish).toHaveBeenCalledTimes(1)
    expect(periodReview.token).toBe('2026-10-17')
    await waitFor(() => expect(screen.queryByTestId('deck')).toBeNull())
    expect(document.querySelector('.pv2-week')).toHaveAttribute('data-week', '2026-10-24')
    expect(new URLSearchParams(window.location.search).get('date')).toBe('2026-10-24')
  })

  // Task 7: the page opens with last week's progress; No day yet is a count.
  it('on the current week the progress line counts the scoped tasks done last week; Review and Place them set the deck on the viewed week', () => {
    const tasks = [
      createMockTask({ id: 'famDone', title: 'Book the vet', context: 'family', scheduledFor: new Date(2026, 9, 12), isAllDay: true, completed: true, updatedAt: recent }),
      createMockTask({ id: 'workDone', title: 'Quarterly numbers', context: 'work', scheduledFor: new Date(2026, 9, 14), isAllDay: true, completed: true, updatedAt: recent }),
      createMockTask({ id: 'w', title: 'Call the plumber', context: 'family', bucket: 'week', weekStart: sat, commitments: [{ level: 'week', periodStart: sat, status: 'open' }], updatedAt: recent }),
    ]
    open('', tasks, { layers: familyOnly })
    expect(screen.getByText(/done last week/).textContent).toBe('1 done last week · Review')
    expect(screen.getByText(/without a day/).closest('.wc-noday')).toHaveTextContent('1 without a day · Place them')
    expect(screen.queryByText('Call the plumber')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Place them' }))
    expect(new URLSearchParams(window.location.search).get('place')).toBe('1')
    expect(new URLSearchParams(window.location.search).get('date')).toBeNull()
  })

  // I3: the line counts exactly what "Place them" deals, a passed day included.
  it('"{n} without a day" is the number of cards Place them deals, including a day that passed undone', () => {
    vi.setSystemTime(new Date(2026, 9, 20, 9)) // Tuesday of the week of Oct 17
    viewer.me = { id: 'scott' }
    const onWeek = { bucket: 'week' as const, weekStart: sat, commitments: [{ level: 'week' as const, periodStart: sat, status: 'open' as const }], updatedAt: recent }
    const tasks = [
      createMockTask({ id: 'noDay', title: 'Call the plumber', ...onWeek }),
      createMockTask({ id: 'missed', title: 'Return the drill', ...onWeek, scheduledFor: new Date(2026, 9, 18), isAllDay: true }),
      createMockTask({ id: 'ahead', title: 'Book the vet', ...onWeek, scheduledFor: new Date(2026, 9, 22), isAllDay: true }),
      createMockTask({ id: 'hers', title: 'Pot the ferns', ...onWeek, assignedTo: 'iris' }),
    ]
    const view = open('', tasks)
    expect(screen.getByText(/without a day/).textContent).toBe('2 without a day')
    view.unmount()
    open('?place=1', tasks)
    expect(props().cards.map((c) => c.key).sort()).toEqual(['missed', 'noDay'])
  })

  // I5: mid-week the strip's days already gone cannot be given.
  it('the strip marks the days before today as past', () => {
    vi.setSystemTime(new Date(2026, 9, 20, 9)) // Tuesday
    open('?review=1', [])
    expect(props().stripDays.map((d) => !!(d as { past?: boolean }).past)).toEqual([true, true, true, false, false, false, false])
  })

  // I4: one record of last week's review — finishing the deck flips the line.
  it('after finishing the deck the page says "reviewed {Weekday}" without a reload', async () => {
    open('?review=1', [createMockTask({ id: 'a', title: 'Fix the gate', scheduledFor: new Date(2026, 9, 12), isAllDay: true, updatedAt: recent })])
    await act(async () => { await props().onFinish(new Set(['a'])) })
    await waitFor(() => expect(screen.queryByTestId('deck')).toBeNull())
    expect(screen.getByText(/done last week/).textContent).toBe('0 done last week · reviewed Saturday')
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Review last week/ })).toBeNull()
  })

  it('Review sets review=1 on the viewed week', () => {
    open('', [])
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    const q = new URLSearchParams(window.location.search)
    expect(q.get('review')).toBe('1')
    expect(q.get('date')).toBeNull()
    expect(screen.getByTestId('deck')).toHaveAttribute('data-mode', 'full')
  })

  it('once last week is reviewed the line says the weekday, with no Review link', () => {
    periodReview.reviewed = { at: new Date(2026, 9, 16, 17) } // Friday
    open('', [])
    expect(screen.getByText(/done last week/).textContent).toBe('0 done last week · reviewed Friday')
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull()
  })

  it('next week on this week’s last day: Review stays on that week', () => {
    vi.setSystemTime(new Date(2026, 9, 23, 18))
    const next = new Date(2026, 9, 24)
    const tasks = [createMockTask({ id: 'd', title: 'Paint the shed', scheduledFor: new Date(2026, 9, 20), isAllDay: true, completed: true, updatedAt: recent })]
    open('', tasks, { weekStart: next })
    expect(screen.getByText(/done last week/).textContent).toBe('1 done last week · Review')
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    const q = new URLSearchParams(window.location.search)
    expect(q.get('review')).toBe('1')
    expect(q.get('date')).toBeNull()
    expect(document.querySelector('.pv2-week')).toHaveAttribute('data-week', '2026-10-24')
  })

  it('finishing with every last-week card decided drains nothing more', async () => {
    open('?review=1', [createMockTask({ id: 'a', title: 'Fix the gate', scheduledFor: new Date(2026, 9, 12), isAllDay: true, updatedAt: recent })])
    await act(async () => { await props().onFinish(new Set(['a'])) })
    expect(deckActions.drain).not.toHaveBeenCalled()
    expect(periodReview.finish).toHaveBeenCalledTimes(1)
  })

  it('?place=1 deals only this week’s cards, and finishing neither drains nor records a review', async () => {
    const tasks = [
      createMockTask({ id: 'w', title: 'Call the plumber', bucket: 'week', weekStart: sat, commitments: [{ level: 'week', periodStart: sat, status: 'open' }], updatedAt: recent }),
      createMockTask({ id: 'last', title: 'Fix the gate', scheduledFor: new Date(2026, 9, 12), isAllDay: true, updatedAt: recent }),
      createMockTask({ id: 'stale', title: 'Old capture', bucket: 'inbox', updatedAt: old }),
    ]
    open('?place=1', tasks)
    expect(screen.getByTestId('deck')).toHaveAttribute('data-mode', 'place')
    expect(props().cards.map((c) => c.key)).toEqual(['w'])
    expect(deckActions.drain).not.toHaveBeenCalled()
    await act(async () => { await props().onFinish(new Set()) })
    expect(deckActions.drain).not.toHaveBeenCalled()
    expect(periodReview.finish).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByTestId('deck')).toBeNull())
    expect(new URLSearchParams(window.location.search).get('place')).toBeNull()
  })

  it('Leave returns to the week without draining or recording; See them opens Someday', async () => {
    open('?review=1', [createMockTask({ id: 'a', title: 'Fix the gate', scheduledFor: new Date(2026, 9, 12), isAllDay: true, updatedAt: recent })])
    act(() => { props().onExit() })
    await waitFor(() => expect(screen.queryByTestId('deck')).toBeNull())
    expect(deckActions.drain).not.toHaveBeenCalled()
    expect(periodReview.finish).not.toHaveBeenCalled()
    cleanup()
    open('?review=1', [])
    act(() => { props().onSeeAged() })
    expect(window.location.pathname).toBe('/someday')
  })
})
