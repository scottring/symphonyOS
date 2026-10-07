import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ALL_LAYERS } from '@/lib/domains'
import { screen, fireEvent, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { ReferenceListsProvider, useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { TodayView } from './TodayView'
import { createMockTask } from '@/test/mocks/factories'

/**
 * Today as a daily journal (2026-09-19): Tasks (chosen), Schedule (the
 * timed day from now), Earlier today (folded). The decisions column, the
 * detail pane and every row action are unchanged.
 */
const mobile = vi.hoisted(() => ({ value: true }))
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => mobile.value }))
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({ setPlanned: vi.fn(async () => true), reschedule: vi.fn(async () => null), getInstancesForRange: vi.fn(async () => []) }),
}))
vi.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ weather: null, loading: false, error: 'x', requestLocation: vi.fn() }) }))
vi.mock('@/hooks/useProactiveSuggestions', () => ({ useProactiveSuggestions: () => ({ suggestions: [], topSuggestions: [], suggestionsForEntity: () => [], actOnSuggestion: vi.fn(), dismissSuggestion: vi.fn(), isLoading: false }) }))
vi.mock('@/hooks/useRoutineStats', () => ({ useRoutineStats: () => ({ getStats: () => undefined }) }))
vi.mock('@/hooks/useRecurringEventDetection', () => ({ useRecurringEventDetection: () => ({ isPromotionSuggested: () => false }) }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projects: [], loading: false, addProject: vi.fn(), deleteProject: vi.fn(), updateProject: vi.fn() }) }))
vi.mock('@/hooks/useNotes', () => ({ useNotes: () => ({ notes: [], loading: false, addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [], loading: false, addTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }) }))
vi.mock('@/hooks/usePinnedItems', () => ({ usePinnedItems: () => ({ isPinned: () => false, pin: vi.fn(), unpin: vi.fn() }) }))
vi.mock('@/hooks/useActionQueue', () => ({ useActionQueue: () => ({ actions: [], loading: false, approveAction: vi.fn(), rejectAction: vi.fn(), pendingCount: 0, refetch: vi.fn() }) }))
const domainMock = vi.hoisted(() => ({ layers: new Set<string>() as ReadonlySet<string>, all: vi.fn() }))
vi.mock('@/hooks/useDomain.tsx', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', layers: domainMock.layers, setDomain: vi.fn(), all: domainMock.all }) }
})
const calendarMock = vi.hoisted(() => ({ isConnected: false, error: null as string | null }))
vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: calendarMock.isConnected, needsReconnect: false, isLoading: false, isFetching: false, events: [], error: calendarMock.error,
    connect: vi.fn(), disconnect: vi.fn(), fetchTodayEvents: vi.fn(), fetchWeekEvents: vi.fn(), fetchEvents: vi.fn(),
    createEvent: vi.fn(), updateEvent: vi.fn(), moveEvent: vi.fn(), deleteEvent: vi.fn(), removeEventLocal: vi.fn(), restoreEventLocal: vi.fn(),
    fetchCalendarList: vi.fn(async () => []), defaultCalendarId: null, setDefaultCalendarId: vi.fn(),
  }),
}))
vi.mock('@/hooks/useTimelineInsert', () => ({
  useTimelineInsert: () => ({ handlePick: vi.fn(), noteComposer: null, closeNoteComposer: vi.fn() }),
}))


// Saturday Sep 19, 2026 at 5:30 PM — the afternoon Scott reviewed.
const NOW = new Date(2026, 8, 19, 17, 30)
const MIDNIGHT = new Date(2026, 8, 19)
const at = (h: number, m = 0) => new Date(2026, 8, 19, h, m)

const ctxValue = { onToggleTask: vi.fn(), onUpdateTask: vi.fn(), onPushTask: vi.fn(), projects: [], contacts: [], familyMembers: [], lists: [] }

const tasks = [
  createMockTask({ id: 'dryer', title: 'Check dryer duct', bucket: 'timed', isAllDay: true, scheduledFor: MIDNIGHT, plannedOn: MIDNIGHT }),
  createMockTask({ id: 'mold', title: 'Figure out washing machine mold', bucket: 'timed', isAllDay: false, scheduledFor: at(7) }),
  createMockTask({ id: 'laundry', title: 'Do kids laundry', bucket: 'timed', isAllDay: false, scheduledFor: at(14), completed: true }),
  createMockTask({ id: 'food', title: 'Food planning', bucket: 'timed', isAllDay: false, scheduledFor: at(19, 30) }),
]

function PinsProbe() {
  const ref = useReferenceLists()
  return <p data-testid="pins">{ref?.pins.map((p) => p.kind).join(',')}</p>
}

function renderView(props: Record<string, unknown> = {}) {
  return render(
    <ReferenceListsProvider userId="u1">
      <ScheduleActionsProvider value={ctxValue as never}>
        <TodayView
          tasks={tasks} events={[]} routines={[]} dateInstances={[]}
          selectedItemId={null} onSelectItem={vi.fn()} onToggleTask={vi.fn()}
          onCompleteRoutine={vi.fn()} onCompleteEvent={vi.fn()} loading={false}
          viewedDate={NOW} onDateChange={vi.fn()}
          projects={[]} {...props}
        />
        <PinsProbe />
      </ScheduleActionsProvider>
    </ReferenceListsProvider>,
  )
}

describe('Carried over', () => {
  // Yesterday's unfinished commitment lives in the planning panel's fold,
  // beside the other things you might choose; Today's main area is the day's
  // scheduled work and chosen focus (Scott, 2026-09-21). The page spends no
  // line on it at all — no rows, no count, no second door (2026-09-21): the
  // fold is the one entrance, and the morning review waits in the ⋯ menu.
  it("draws neither yesterday's unfinished commitment nor a line pointing at it", () => {
    const yesterday = createMockTask({ id: 'yest', title: 'Order Comma 4', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 8, 18) })
    renderView({ tasks: [...tasks, yesterday] })
    expect(screen.queryByRole('heading', { name: 'Carried over' })).not.toBeInTheDocument()
    expect(screen.queryByText('Order Comma 4')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Review unfinished work/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Carried over · \d/)).toBeNull()
    // The door, off the page: the ⋯ menu.
    fireEvent.click(screen.getAllByRole('button', { name: /more controls/i })[0])
    expect(screen.getByRole('button', { name: 'Review carried-over work' })).toBeInTheDocument()
  })

  it('offers no review when nothing was left behind', () => {
    renderView()
    fireEvent.click(screen.getAllByRole('button', { name: /more controls/i })[0])
    expect(screen.queryByRole('button', { name: 'Review carried-over work' })).not.toBeInTheDocument()
  })
})

beforeEach(() => {
  localStorage.removeItem('symphony-plan-v2.view.today')
  domainMock.layers = ALL_LAYERS
  sessionStorage.clear()
  mobile.value = false
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers() })

describe('Today as a daily journal', () => {
  it('titles the page with the date, not a greeting', () => {
    renderView()
    expect(screen.getByRole('heading', { level: 1, name: 'Saturday, September 19' })).toBeInTheDocument()
    expect(screen.queryByText(/good (morning|afternoon|evening)/i)).toBeNull()
  })

  it('For today holds what was chosen; The day draws the timed day', () => {
    renderView()
    const focus = screen.getByRole('region', { name: 'For today' })
    const ahead = screen.getByRole('region', { name: 'The day' })
    expect(within(focus).getByText('Check dryer duct')).toBeInTheDocument()
    expect(within(ahead).getByText('Food planning')).toBeInTheDocument()
    expect(within(ahead).queryByText('Check dryer duct')).toBeNull()
  })

  // Drawn to scale (2026-10-06): what is over stays where it fell, faded,
  // with its check still there — nothing folds away.
  it('keeps what is over on the day, faded, and says which of it is done', () => {
    renderView()
    const day = screen.getByRole('region', { name: 'The day' })
    const mold = within(day).getByText('Figure out washing machine mold').closest('.today-scale-item')!
    expect(mold).toHaveClass('is-past')
    expect(within(mold as HTMLElement).getByRole('button', { name: /^Figure out washing machine mold,/ }).getAttribute('aria-label')).not.toMatch(/, done/)
    // Its icon tile finishes it from the day (design B, 2026-10-07).
    expect(within(mold as HTMLElement).getByRole('button', { name: 'Done: Figure out washing machine mold' })).toBeInTheDocument()
    expect(within(day).getByText('Do kids laundry')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Earlier today/ })).toBeNull()
  })

  it('an empty focus offers the week to choose from — a control you can see', () => {
    renderView({ tasks: tasks.filter((t) => t.id !== 'dryer') })
    expect(screen.getByText('Nothing chosen yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Choose something for today/ })).toBeNull()
    // Today opens without the week; the empty state offers it.
    fireEvent.click(screen.getByRole('button', { name: /^show week \d+$/ }))
    expect(screen.getByRole('region', { name: /for reference$/ })).toBeInTheDocument()
    expect(screen.getByText(/Choose from week \d+ (beside this list|below), or add something for today/)).toBeInTheDocument()
  })

  it('an empty list under filters says the filters are on and offers Show everything', () => {
    const onSelectAssignees = vi.fn()
    domainMock.layers = new Set(['work'])
    domainMock.all.mockClear()
    renderView({ tasks: [], selectedAssignees: ['m1'], onSelectAssignees })
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    expect(domainMock.all).toHaveBeenCalledOnce()
    expect(onSelectAssignees).toHaveBeenCalledWith([])
    domainMock.layers = ALL_LAYERS
  })

  // 2026-10-07 on prod: the calendar arrived before the tasks, so the page
  // drew — and For today said "Nothing chosen yet." over a day with work.
  it('while the tasks are still loading, For today says so instead of "Nothing chosen yet"', () => {
    const event = { id: 'e1', google_event_id: 'e1', title: 'Boxing', start_time: new Date(2026, 8, 19, 18).toISOString(), end_time: new Date(2026, 8, 19, 19).toISOString(), all_day: false }
    renderView({ tasks: [], events: [event], loading: true })
    expect(screen.queryByText('Nothing chosen yet.')).toBeNull()
    expect(screen.getByText('Loading your list…')).toBeInTheDocument()
  })

  it('an unfiltered empty list does not mention filters', () => {
    renderView({ tasks: [] })
    expect(screen.getByText('Nothing chosen yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show everything' })).toBeNull()
  })

  // A failed read is not an empty day: "Nothing chosen yet." over tasks that
  // never arrived tells someone their list is gone.
  it('a failed task read says Today didn’t load and offers Try again — never "Nothing chosen yet."', () => {
    const onRetryTasks = vi.fn()
    renderView({ tasks: [], tasksLoadFailed: true, onRetryTasks })
    const notice = screen.getByRole('alert')
    expect(notice).toHaveTextContent('Today didn’t load.')
    expect(notice).toHaveTextContent('Your tasks are safe — this is a connection problem.')
    expect(screen.queryByText('Nothing chosen yet.')).toBeNull()
    expect(screen.queryByText('Nothing else coming up this week.')).toBeNull()
    fireEvent.click(within(notice).getByRole('button', { name: 'Try again' }))
    expect(onRetryTasks).toHaveBeenCalledOnce()
  })

  it('an empty list that did load keeps the empty copy and no error', () => {
    renderView({ tasks: [], tasksLoadFailed: false, onRetryTasks: vi.fn() })
    expect(screen.getByText('Nothing chosen yet.')).toBeInTheDocument()
    expect(screen.queryByText('Today didn’t load.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  // Scott, 2026-09-30: Today is the day alone unless its week is asked for —
  // no "Needs a Decision" column (it was never visible anyway: no
  // @container ancestor). Slipped work stays behind ⋯ → Review carried-over work.
  it('stays column-free when there is something to decide', () => {
    const slipped = createMockTask({ id: 'old', title: 'Slipped thing', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 5, 1), createdAt: new Date(2026, 5, 1) })
    renderView({ tasks: [...tasks, slipped] })
    expect(screen.queryByText('Needs a Decision')).toBeNull()
    expect(screen.queryByRole('region', { name: /for reference$/ })).toBeNull()
  })

  it('another day draws its day with no now line and nothing past', () => {
    renderView({ viewedDate: new Date(2026, 8, 20), tasks: [createMockTask({ id: 'sun', title: 'Sunday run', bucket: 'timed', isAllDay: false, scheduledFor: new Date(2026, 8, 20, 8) })] })
    const day = screen.getByRole('region', { name: 'The day' })
    expect(day).toHaveTextContent('Sunday run')
    expect(day.querySelector('.today-scale-now')).toBeNull()
    expect(day.querySelector('.is-past')).toBeNull()
  })
})

describe('the calendar-clear claim', () => {
  // "Your calendar is clear" only when connected, synced and unfiltered; a
  // Personal calendar hidden under a Family filter is not a clear day.
  beforeEach(() => { calendarMock.isConnected = true; calendarMock.error = null })
  afterEach(() => { calendarMock.isConnected = false })

  it('claims a clear calendar only with every layer showing', () => {
    renderView({ tasks: [] })
    expect(screen.getByText(/Your calendar is clear/)).toBeInTheDocument()
  })

  it('says "no events shown for your current view" when a layer is filtered out', () => {
    domainMock.layers = new Set(['family'])
    renderView({ tasks: [] })
    expect(screen.getByText(/No events shown for your current view/)).toBeInTheDocument()
    expect(screen.queryByText(/Your calendar is clear/)).toBeNull()
    domainMock.layers = ALL_LAYERS
  })

  it('never claims "clear" while a sync error stands', () => {
    calendarMock.error = 'Google returned 503'
    renderView({ tasks: [] })
    expect(screen.queryByText(/Your calendar is clear/)).toBeNull()
  })
})

it('folds completed untimed work without hiding the ability to reopen and undo it', () => {
  const done = createMockTask({ id: 'done-focus', title: 'Finished today task', bucket: 'timed', isAllDay: true, scheduledFor: MIDNIGHT, completed: true })
  renderView({ tasks: [...tasks, done] })
  expect(screen.queryByText('Finished today task')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Completed · 1' }))
  expect(screen.getByText('Finished today task')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Completed · 1' })).toHaveAttribute('aria-expanded', 'true')
})

// Design B (2026-10-07): tonight's dinner under For today — family content,
// tonight's plan, so only on today and only where Family shows.
describe('Dinner tonight on Today', () => {
  const dinner = { id: 'event-meal:e1', title: 'Sweet Potato and Black Bean Tacos', time: '6:30 PM', minutes: 20, cue: 'Uses Tuesday’s extra sweet potatoes.', imageUrl: null }
  it('shows tonight’s dinner, and opens the meal on a tap', () => {
    const onSelectItem = vi.fn()
    renderView({ dinner, onSelectItem })
    fireEvent.click(screen.getByRole('button', { name: /Dinner tonight: Sweet Potato and Black Bean Tacos/ }))
    expect(onSelectItem).toHaveBeenCalledWith('event-meal:e1')
    expect(screen.getByText('6:30 PM · 20 min · Uses Tuesday’s extra sweet potatoes.')).toBeInTheDocument()
  })

  it('stays off another day, and off a view without Family', () => {
    const { unmount } = renderView({ dinner, viewedDate: new Date(2026, 8, 20) })
    expect(screen.queryByRole('region', { name: 'Dinner tonight' })).toBeNull()
    unmount()
    domainMock.layers = new Set(['work'])
    renderView({ dinner })
    expect(screen.queryByRole('region', { name: 'Dinner tonight' })).toBeNull()
    domainMock.layers = ALL_LAYERS
  })
})

