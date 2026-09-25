// Does a weekend or custom run on /week survive a reload?
//
// weekStartParam only wrote `start` for the seven-day week, and arrival built
// a weekend from today and never read a custom run back — so a weekend paged
// forward came back as THIS weekend, and a custom run as the full week. This
// renders the real HomeView, moves the range, then renders again from the
// URL it left behind: the same thing a reload does.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { HomeView } from './HomeView'
import { ScheduleActionsProvider } from '@/contexts/ScheduleActionsContext'
import { AppShellChromeContext } from '@/contexts/AppShellChromeContext'
import type { ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { ALL_LAYERS } from '@/lib/domains'
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

// Wednesday Sep 23 2026: "this weekend" is Sep 26–27.
const WEDNESDAY = new Date(2026, 8, 23, 9, 0)

const baseProps = {
  tasks: [],
  userId: 'u1',
  events: [] as CalendarEvent[],
  routines: [],
  allActiveRoutines: [],
  projects: [],
  dateInstances: [],
  selectedItemId: null,
  onSelectItem: vi.fn(),
  loading: false,
  viewedDate: WEDNESDAY,
  onDateChange: vi.fn(),
  fixedView: 'week' as const,
  layers: ALL_LAYERS,
}

const ctx = { onUpdateTask: vi.fn(async () => true) } as unknown as ScheduleActionsValue

/** Render /week at `url` — a first load or a reload, as far as HomeView can tell. */
const load = (url: string) => {
  window.history.replaceState(null, '', url)
  return render(
    <AppShellChromeContext.Provider value={{ chatOpen: false, onChatOpenChange: vi.fn() }}>
      <ScheduleActionsProvider value={ctx}>
        <HomeView {...baseProps} />
      </ScheduleActionsProvider>
    </AppShellChromeContext.Provider>,
  )
}
const reload = (view: ReturnType<typeof load>) => {
  const url = window.location.pathname + window.location.search
  view.unmount()
  return load(url)
}

describe('/week restores the run it was showing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(WEDNESDAY)
  })
  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState(null, '', '/')
  })

  it('a weekend paged forward reopens on the days paged to, not this weekend', () => {
    const view = load('/week?range=weekend')
    expect(screen.getByRole('heading', { name: 'Sep 26 – Sep 27' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.getByRole('heading', { name: 'Sep 28 – Sep 29' })).toBeInTheDocument()
    reload(view)
    expect(screen.getByRole('heading', { name: 'Sep 28 – Sep 29' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2 days/ })).toBeInTheDocument()
  })

  it('a later weekend in the URL opens as that weekend', () => {
    load('/week?range=weekend&start=2026-10-03&days=2')
    expect(screen.getByRole('heading', { name: 'Oct 3 – Oct 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Weekend/ })).toBeInTheDocument()
  })

  it('a custom run picked from the inputs reopens as that run, without reopening the inputs', () => {
    const view = load('/week?range=custom')
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-09-22' } })
    expect(screen.getByRole('button', { name: /3 days/ })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('days')).toBe('3')
    reload(view)
    expect(screen.getByRole('button', { name: /3 days/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('End')).not.toBeInTheDocument()
  })

  it('a custom seven-day run from Thursday stays Thursday-first', () => {
    load('/week?range=custom&start=2026-10-01&days=7')
    expect(screen.getByRole('heading', { name: 'Oct 1 – Oct 7' })).toBeInTheDocument()
  })

  // Unchanged: `start` alone is still the calendar week around it.
  it('start alone still opens the calendar week', () => {
    load('/week?start=2026-10-01')
    expect(screen.getByRole('heading', { name: 'Sep 27 – Oct 3' })).toBeInTheDocument()
  })
})
