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
const domainMock = vi.hoisted(() => ({ layers: new Set<string>() as ReadonlySet<string> }))
vi.mock('@/hooks/useDomain.tsx', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, useDomain: () => ({ currentDomain: 'universal', layers: domainMock.layers, setDomain: vi.fn() }) }
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

  it('Tasks holds what was chosen; Schedule holds the rest of the timed day', () => {
    renderView()
    const focus = screen.getByRole('region', { name: 'Tasks' })
    const ahead = screen.getByRole('region', { name: 'Schedule' })
    expect(within(focus).getByText('Check dryer duct')).toBeInTheDocument()
    expect(within(ahead).getByText('Food planning')).toBeInTheDocument()
    expect(within(ahead).queryByText('Check dryer duct')).toBeNull()
  })

  it('folds what is over into Earlier today, saying what is still not done — and opens it', () => {
    renderView()
    expect(screen.queryByText('Figure out washing machine mold')).toBeNull()
    const fold = screen.getByRole('button', { name: /Earlier today · 2 · 1 not done/ })
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(fold)
    expect(screen.getByText('Figure out washing machine mold')).toBeInTheDocument()
    expect(screen.getByText('Do kids laundry')).toBeInTheDocument()
  })

  it('an empty focus offers the plan — on desktop that opens the Today pin', () => {
    renderView({ tasks: tasks.filter((t) => t.id !== 'dryer') })
    expect(screen.getByText('Nothing chosen yet.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose something for today →' }))
    expect(screen.getByTestId('pins')).toHaveTextContent('today')
  })

  it('keeps the decisions column when there is something to decide', () => {
    const slipped = createMockTask({ id: 'old', title: 'Slipped thing', bucket: 'timed', isAllDay: true, scheduledFor: new Date(2026, 5, 1), createdAt: new Date(2026, 5, 1) })
    renderView({ tasks: [...tasks, slipped] })
    expect(screen.getByText('Needs a Decision')).toBeInTheDocument()
  })

  it('another day reads as one Schedule, with nothing folded', () => {
    renderView({ viewedDate: new Date(2026, 8, 20), tasks: [createMockTask({ id: 'sun', title: 'Sunday run', bucket: 'timed', isAllDay: false, scheduledFor: new Date(2026, 8, 20, 8) })] })
    expect(screen.getByRole('region', { name: 'Schedule' })).toHaveTextContent('Sunday run')
    expect(screen.queryByRole('button', { name: /Earlier today/ })).toBeNull()
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
