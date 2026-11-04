// The Day session's way back, through the REAL HomeViewContainer.
//
// Walk, 2026-11-01 (vite preview, 5:40 pm): on /today?view=alongside, Plan
// tomorrow took the page to Monday; Leave cleaned the URL but the page stayed
// on Monday. TodayView's own test passed with a stand-in parent. The real
// container wraps the day in AlongsideDayBridge, which drew the connected
// workspace only while no session ran: opening or leaving the session swapped
// the tree around the day, so TodayView remounted and lost what it was
// holding to go back (its returnTo ref). Here the data hooks are stubbed and
// HomeView is a probe that does what TodayView does on Leave: remember the
// day to return to, clear ?plan and ?date in one write, and move the day once
// the session has closed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { render, screen, act } from '@/test/test-utils'
import { localYmd } from '@/lib/cadence/config'
import { HomeViewContainer } from './HomeViewContainer'

const s = vi.hoisted(() => {
  const fn = () => () => undefined
  const stub = <T extends object>(base: T) => new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof T] : fn()) }) as T & Record<string, () => void>
  return {
    stub,
    tasks: stub({ tasks: [], loading: false, error: null, userId: 'u1', refetch: async () => undefined }),
    calendar: stub({ isConnected: false, events: [], isLoading: false, isFetching: false, error: null, fetchEvents: async () => undefined }),
    eventNotes: stub({ notes: new Map() }),
    contacts: stub({ contacts: [], contactsMap: new Map() }),
    projects: stub({ projects: [], projectsMap: new Map() }),
    routines: stub({ routines: [], activeRoutines: [], loading: false, getRoutinesForDate: () => [] }),
    instances: stub({}),
    family: stub({ members: [], getCurrentUserMember: () => null }),
    hidden: stub({ isHidden: () => false }),
    mappings: stub({ getDomainForCalendar: () => null }),
    lists: stub({ lists: [], listsByCategory: {} }),
    notes: stub({}),
    undo: stub({ currentAction: null }),
    learning: stub({ aliases: [] }),
    selection: stub({ selection: null }),
    meals: [] as unknown[],
    firstWeek: stub({ signals: null }),
    filtering: stub({ filteredEvents: [], filteredRoutines: [], dateInstances: [] }),
    actions: stub({}),
    gated: stub({}),
    // The probe's record: how many times the day page mounted, and the day
    // it was given.
    probe: { mounts: 0 },
  }
})

vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => s.tasks }))
vi.mock('@/hooks/useGoogleCalendar', () => ({ useGoogleCalendar: () => s.calendar, CalendarReconnectError: class extends Error {} }))
vi.mock('@/hooks/useEventNotes', () => ({ useEventNotes: () => s.eventNotes }))
vi.mock('@/hooks/useContacts', () => ({ useContacts: () => s.contacts }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => s.projects }))
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => s.routines }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => s.instances }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => s.family }))
vi.mock('@/hooks/useHiddenCalendarEvents', () => ({ useHiddenCalendarEvents: () => s.hidden }))
vi.mock('@/hooks/useCalendarDomainMappings', () => ({ useCalendarDomainMappings: () => s.mappings }))
vi.mock('@/contexts/ListsContext', () => ({ useListsContext: () => s.lists }))
vi.mock('@/contexts/NotesContext', () => ({ useNotesContext: () => s.notes }))
vi.mock('@/hooks/useUndo', () => ({ useUndo: () => s.undo }))
vi.mock('@/components/undo/UndoToast', () => ({ UndoToast: () => null }))
vi.mock('@/hooks/useResolutionLearning', () => ({ useResolutionLearning: () => s.learning }))
vi.mock('@/shell/providers/SelectionProvider', () => ({ useSelection: () => s.selection }))
vi.mock('@/shell/providers/MealEventsProvider', () => ({ useMealEventsForDate: () => s.meals }))
vi.mock('@/hooks/useFirstWeekSignals', () => ({ useFirstWeekSignals: () => s.firstWeek }))
vi.mock('@/hooks/useScheduleFiltering', () => ({ useScheduleFiltering: () => s.filtering }))
vi.mock('@/hooks/useScheduleActions', () => ({ useScheduleActions: () => s.actions }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => s.gated }))
vi.mock('@/hooks/useInstancesRealtime', () => ({ useInstancesRealtime: () => undefined }))
vi.mock('@/hooks/useRefreshOnVisible', () => ({ useRefreshOnVisible: () => undefined }))
vi.mock('@/hooks/useDayRollover', () => ({ useDayRollover: () => undefined }))
vi.mock('@/hooks/useConvertTaskToProject', () => ({ useConvertTaskToProject: () => () => undefined }))
vi.mock('@/hooks/useSendTaskToBuy', () => ({ useSendTaskToBuy: () => () => undefined }))
vi.mock('@/components/plan/PlanningNudge', () => ({ PlanningNudge: () => null }))
vi.mock('@/components/schedule/FirstWeekCard', () => ({ FirstWeekCard: () => null }))
vi.mock('@/components/capture/PaperPlanFlow', () => ({ PaperPlanFlow: () => null }))
vi.mock('@/components/capture/PageFromPaperFlow', () => ({ PageFromPaperFlow: () => null }))
vi.mock('@/lib/supabase', () => ({ getAuthUser: async () => ({ data: { user: null } }), supabase: {} }))

// HomeView → TodayView's Day session, reduced to its URL and day contract
// (TodayView.tsx openDaySession / closeDaySession / returnTo).
vi.mock('@/components/home', () => ({
  HomeView: ({ viewedDate, onDateChange }: { viewedDate: Date; onDateChange: (d: Date) => void }) => {
    const [params, setParams] = useSearchParams()
    const planOpen = params.get('plan') === '1'
    const returnTo = useRef<Date | null>(null)
    useEffect(() => { s.probe.mounts += 1 }, [])
    useEffect(() => {
      if (planOpen || !returnTo.current) return
      const today = returnTo.current
      returnTo.current = null
      onDateChange(today)
    }, [planOpen, onDateChange])
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    return (
      <div>
        <h1>{localYmd(viewedDate)}</h1>
        <button onClick={() => setParams((prev) => { const p = new URLSearchParams(prev); p.set('plan', '1'); p.set('date', localYmd(tomorrow)); return p })}>Plan tomorrow</button>
        <button onClick={() => {
          returnTo.current = new Date(new Date().setHours(0, 0, 0, 0))
          setParams((prev) => { const p = new URLSearchParams(prev); p.delete('plan'); p.delete('date'); return p })
        }}>Leave</button>
      </div>
    )
  },
}))

describe('HomeViewContainer — leaving the Day session', () => {
  beforeEach(() => { s.probe.mounts = 0 })
  afterEach(() => { window.history.replaceState({}, '', '/') })
  const search = () => new URLSearchParams(window.location.search)
  const today = () => localYmd(new Date())
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return localYmd(d) }

  it.each([
    ['in the connected workspace (?view=alongside)', '/today?view=alongside'],
    ['on the plain page', '/today'],
  ])('%s, Leave returns the page to today with a clean URL, and the day page is never remounted', async (_, url) => {
    window.history.replaceState({}, '', url)
    const { user } = render(<HomeViewContainer />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(today())

    // The header's plan chip (a probe here).
    await user.click(screen.getByRole('button', { name: 'Plan tomorrow' }))
    expect(search().get('plan')).toBe('1')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(tomorrow())
    // The session is the same page: the week stays folded beside the day
    // (planning as tooltips, 2026-11-04; its Pick step opens it).
    if (url.includes('alongside')) expect(screen.getByRole('button', { name: /Unfold to read$/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Leave' }))
    await act(async () => {})
    expect(search().get('plan')).toBeNull()
    expect(search().get('date')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(today())
    // (TodayView is a probe here, so only the workspace's fold is drawn.)
    if (url.includes('alongside')) expect(screen.getByRole('button', { name: /Unfold to read$/ })).toBeInTheDocument()
    // The day page holds the way back; the session opening and closing must
    // not swap the tree around it.
    expect(s.probe.mounts).toBe(1)
  })

  it('a session opened from the URL (?view=alongside&plan=1) also comes back to today on Leave', async () => {
    window.history.replaceState({}, '', `/today?view=alongside&plan=1&date=${tomorrow()}`)
    const { user } = render(<HomeViewContainer />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(tomorrow())
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    await act(async () => {})
    expect(search().get('date')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(today())
    expect(s.probe.mounts).toBe(1)
  })
})

// Walk 2026-11-01: the Week session's look back shows the week before the one
// it plans, with that week's events, so the Week's calendar read reaches back
// a week while a session is open (and only then).
describe('HomeViewContainer — the Week session reads last week’s events too', () => {
  const was = { connected: s.calendar.isConnected, fetch: s.calendar.fetchEvents }
  afterEach(() => {
    s.calendar.isConnected = was.connected; s.calendar.fetchEvents = was.fetch
    window.history.replaceState({}, '', '/')
  })
  const fetchedFrom = async (url: string) => {
    const fetchEvents = vi.fn(async () => undefined)
    s.calendar.isConnected = true; s.calendar.fetchEvents = fetchEvents
    window.history.replaceState({}, '', url)
    const view = render(<HomeViewContainer fixedView="week" />)
    await act(async () => {})
    view.unmount()
    return localYmd((fetchEvents.mock.calls.at(-1) as unknown as [Date, Date])[0])
  }

  it('with ?plan=1 the read starts a week before the viewed week’s; without, at it', async () => {
    // Wednesday Oct 21, 2026: the viewed week's read starts Sunday Oct 18.
    expect(await fetchedFrom('/week?date=2026-10-21')).toBe('2026-10-18')
    expect(await fetchedFrom('/week?plan=1&date=2026-10-21')).toBe('2026-10-11')
    expect(await fetchedFrom('/week?review=1&date=2026-10-21')).toBe('2026-10-11')
  })
})
