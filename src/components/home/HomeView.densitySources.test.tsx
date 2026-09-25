// Does the source status a PARENT computes actually reach the day tiles?
//
// Codex, 2026-09-24: the first version of this feature had `eventsAvailable`
// defaulting to true and no caller supplying it, so the unknown state could
// never appear live and an isolated prop test would have passed anyway. This
// renders the real HomeView on its week view and checks the whole hop.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@/test/test-utils'
import { HomeView } from './HomeView'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { AppShellChromeContext } from '@/contexts/AppShellChromeContext'
import type { ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { createMockTask } from '@/test/mocks/factories'
import { densitySourcesFor } from '@/lib/planning/dayDensity'
import { ALL_LAYERS } from '@/lib/domains'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

vi.mock('@/hooks/useDayPlan', () => ({
  useDayPlan: () => ({
    loading: false, error: false,
    plan: {
      toPlan: [], carried: [], scheduled: [], available: [], week: [], month: [],
      counts: { scheduled: 0, available: 0 }, offMainTaskIds: new Set(), offMainRoutineItemIds: new Set(), plannedExtraTasks: [],
    },
  }),
}))
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({
    getInstancesForRange: async () => [],
    markDone: vi.fn(async () => true), undoDone: vi.fn(async () => true),
    setPlanned: vi.fn(async () => true), reschedule: vi.fn(async () => null),
  }),
}))

// HomeView draws the week around the CLOCK, not around a viewedDate prop, so
// the clock is pinned inside the week these fixtures describe (Sep 13–19).
const SUNDAY = new Date(2026, 8, 13)
const MONDAY = new Date(2026, 8, 14)
const WEDNESDAY = new Date(2026, 8, 16, 9, 0)

const task: Task = createMockTask({ id: 'a', title: 'List supplies to buy', scheduledFor: MONDAY, isAllDay: true })

const baseProps = {
  tasks: [task],
  userId: 'u1',
  events: [] as CalendarEvent[],
  routines: [],
  allActiveRoutines: [],
  projects: [],
  dateInstances: [],
  selectedItemId: null,
  onSelectItem: vi.fn(),
  loading: false,
  viewedDate: SUNDAY,
  onDateChange: vi.fn(),
  fixedView: 'week' as const,
  layers: ALL_LAYERS,
}

/** Only what the week's journal rows actually reach for. */
const ctx = { onUpdateTask: vi.fn(async () => true) } as unknown as ScheduleActionsValue

const show = (props: Partial<Parameters<typeof HomeView>[0]> = {}) =>
  render(
    <AppShellChromeContext.Provider value={{ chatOpen: false, onChatOpenChange: vi.fn() }}>
      <ScheduleActionsProvider value={ctx}>
        <HomeView {...baseProps} {...props} />
      </ScheduleActionsProvider>
    </AppShellChromeContext.Provider>,
  )

const openTiming = () => {
  const monday = within(screen.getByTestId('journal-day-2026-09-14'))
  fireEvent.click(monday.getByRole('button', { name: /Choose a week or a day for List supplies to buy/ }))
}

describe('HomeView hands the week its source status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(WEDNESDAY)
  })
  afterEach(() => { vi.useRealTimers() })

  it('a paged week, whose events are still last week’s, is UNKNOWN not quiet', () => {
    // Exactly what the container derives while a fetch is in flight.
    const sources = densitySourcesFor({
      tasksLoading: false, routinesLoading: false,
      calendar: { connected: true, loading: false, fetching: false, error: null },
      heldRange: { start: 0, end: 10 },
      neededRange: { start: 1000, end: 2000 },
    })
    expect(sources.events).toBe('stale')
    show({ densitySources: sources })
    openTiming()
    const wed = screen.getByRole('menuitemradio', { name: /Wed, Sep 16/ })
    expect(wed).toHaveAccessibleName(/still loading/)
    expect(wed).not.toHaveAccessibleName(/nothing on it yet/)
  })

  it('no calendar connected reads as complete, and says so without crying failure', () => {
    const sources = densitySourcesFor({
      tasksLoading: false, routinesLoading: false,
      calendar: { connected: false, loading: false, fetching: false, error: null },
      heldRange: null, neededRange: null,
    })
    show({ densitySources: sources })
    openTiming()
    const wed = screen.getByRole('menuitemradio', { name: /Wed, Sep 16/ })
    expect(wed).toHaveAccessibleName(/nothing on it yet · no calendar connected/)
    expect(wed.getAttribute('aria-label')).not.toMatch(/error|couldn|fail|loading/i)
  })

  it('a failed calendar read is an error, and is not drawn as an empty day', () => {
    const sources = densitySourcesFor({
      tasksLoading: false, routinesLoading: false,
      calendar: { connected: true, loading: false, fetching: false, error: 'Google returned 503' },
      heldRange: { start: 0, end: 10 }, neededRange: null,
    })
    show({ densitySources: sources })
    openTiming()
    expect(screen.getByRole('menuitemradio', { name: /Wed, Sep 16/ }))
      .toHaveAccessibleName(/the calendar couldn’t be read/)
  })

  // The regression that matters: a parent that forgets to pass it at all.
  it('with nothing passed, the days read as counted — the old, always-ready shape', () => {
    show()
    openTiming()
    expect(screen.getByRole('menuitemradio', { name: /Wed, Sep 16/ })).toHaveAccessibleName(/nothing on it yet/)
    expect(screen.getByRole('menuitemradio', { name: /Mon, Sep 14/ })).toHaveAccessibleName(/1 task already/)
  })
})
