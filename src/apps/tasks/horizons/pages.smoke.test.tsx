// src/apps/tasks/horizons/pages.smoke.test.tsx
//
// Smoke tests for the per-page extraction (Task 1 of the week/month
// unification plan): each page must mount with empty data and no crash, and
// show a landmark unique to that horizon. This is the RED/GREEN gate for the
// mechanical HorizonView split — it does not test behavior beyond "renders".

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { render as rtlRender, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { PlaceProvider } from '@/hooks/usePlace'
import { DomainProvider } from '@/hooks/useDomain'
import { createMockTask } from '@/test/mocks/factories'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'

// ── Context/selection hooks that throw without a real provider: mock them
// directly (same pattern as src/components/omnibox/OmniboxResults.test.tsx). ──
vi.mock('@/shell/providers/SelectionProvider', () => ({
  useSelection: () => ({ selection: null, setSelection: vi.fn() }),
}))
vi.mock('@/contexts/ListsContext', () => ({
  useListsContext: () => ({ lists: [], listsByCategory: {} }),
}))
vi.mock('@/contexts/GoalsContext', () => ({
  useGoalsContext: () => ({ areas: [], goals: mockGoals, addGoal: vi.fn() }),
}))

// ── Data hooks: empty fixtures are enough for an empty-state smoke render.
// `mockTasks` is mutable (via vi.hoisted so the mock factory can close over
// it) — most tests leave it empty; the anchored-week tests below populate it
// per-case and a top-level beforeEach resets it so nothing bleeds between
// tests. ──
// `mockUpdateTask` is hoisted (not a fresh `vi.fn()` per hook call) so tests
// can assert on calls made through it — e.g. MonthPage's onPlaceTask wiring.
const { mockTasks, mockUpdateTask, mockGoals } = vi.hoisted(() => ({
  mockTasks: [] as unknown[],
  mockUpdateTask: vi.fn(),
  mockGoals: [] as Goal[],
}))
vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({
    tasks: mockTasks, addTask: vi.fn(), toggleTask: vi.fn(), toggleWaiting: vi.fn(),
    deleteTask: vi.fn(), updateTask: mockUpdateTask, updateTasksBulk: vi.fn(),
    pushTask: vi.fn(), setBucket: vi.fn(),
  }),
}))
vi.mock('@/hooks/useEventNotes', () => ({
  useEventNotes: () => ({
    notes: new Map(), updateEventAssignment: vi.fn(), updateEventAssignmentAll: vi.fn(),
    updateEventContext: vi.fn(), updateEventProject: vi.fn(),
  }),
}))
vi.mock('@/hooks/useContacts', () => ({
  useContacts: () => ({ contacts: [], contactsMap: new Map(), addContact: vi.fn(), searchContacts: vi.fn() }),
}))
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ projects: [], projectsMap: new Map(), addProject: vi.fn(), deleteProject: vi.fn() }),
}))
vi.mock('@/hooks/useRoutines', () => ({
  useRoutines: () => ({ routines: [], updateRoutine: vi.fn(), deleteRoutine: vi.fn() }),
}))
vi.mock('@/hooks/useActionableInstances', () => ({
  useActionableInstances: () => ({ markDone: vi.fn(), undoDone: vi.fn(), skip: vi.fn(), reschedule: vi.fn() }),
}))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [], getCurrentUserMember: () => undefined }),
}))
vi.mock('@/hooks/useHiddenCalendarEvents', () => ({
  useHiddenCalendarEvents: () => ({ hideEvent: vi.fn() }),
}))
vi.mock('@/hooks/useCalendarDomainMappings', () => ({
  useCalendarDomainMappings: () => ({ getDomainForCalendar: vi.fn() }),
}))
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => ({ notes: {}, patchNotes: vi.fn(), loading: false }),
}))

import { WeekPage } from './WeekPage'
import { MonthPage } from './MonthPage'
import { SeasonPage } from './SeasonPage'
import { YearPage } from './YearPage'
import { SomedayPage } from './SomedayPage'

// Local copy of WeekPage's `?start=` formatter (LOCAL date parts — never
// toISOString(), which would shift the date near midnight in negative-UTC
// timezones).
function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Dates computed relative to the real "now" (never hardcoded), so these
// tests stay correct no matter when the suite runs.
//
// PlanningSession's grid only ever renders the ONE day it was mounted with
// (dateRange starts as `[initialDate]`; growing to a week is a manual "+Day"
// action, out of scope here) — so the probe task must land on exactly the
// day the grid opens on:
//  - anchored: `gridInitialDate` is the anchored week's start day itself.
//  - unanchored: `weekGridStart` is always today (see shared.tsx —
//    `weekAnchor` for the current week is never after today, so the
//    ternary always resolves to `todayStart`).
const cadence = readCadenceConfig()
const now = new Date()
const currentWeekStart = weekStartAnchor(now, cadence.weekStartsOn)
const anchorWeekStart = new Date(currentWeekStart)
anchorWeekStart.setDate(anchorWeekStart.getDate() + 8 * 7) // 8 weeks out — never "this week"

const anchorTaskDate = new Date(anchorWeekStart)
anchorTaskDate.setHours(10, 0, 0, 0)

// Today — the single day the grid opens on when there's no `?start=` anchor.
const currentWeekTaskDate = new Date(now)
currentWeekTaskDate.setHours(10, 0, 0, 0)

// Finds the calendar grid cell for "today" — the one cell whose day-number
// span carries the isToday styling (`bg-primary-600`) — and returns its
// parent cell div, the element the grid's onDrop handler is bound to.
function todayGridCell(container: HTMLElement): HTMLElement {
  const span = Array.from(container.querySelectorAll('span')).find((s) => s.className.includes('bg-primary-600'))
  if (!span?.parentElement) throw new Error('today grid cell not found')
  return span.parentElement
}

describe('horizon pages (smoke)', () => {
  beforeEach(() => { mockTasks.length = 0; mockGoals.length = 0; mockUpdateTask.mockClear() })

  it('WeekPage renders the week scaffold with an empty pool', () => {
    render(<WeekPage />)
    // Two "Plan the week" buttons exist with an empty pool (header + empty
    // state) — the header one is the only one with this title, so it's the
    // unique landmark.
    expect(screen.getByTitle('Plan the week')).toBeInTheDocument()
  })

  it('WeekPage masthead shows the rhythm h1 and placed/pool subtitle', () => {
    render(<WeekPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'This Week' })).toBeInTheDocument()
    expect(screen.getByText(/0 placed, 0 to place/)).toBeInTheDocument()
  })

  it('WeekPage renders one surface — no duplicate list sections', () => {
    render(<WeekPage />)
    expect(screen.queryByText(/^Carried over/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Placed this week/)).not.toBeInTheDocument()
    // The shelf is the only pool surface:
    expect(screen.getByRole('button', { name: /tend/i })).toBeInTheDocument()
  })

  it('MonthPage renders the calendar grid weekday header', () => {
    render(<MonthPage />)
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Mon')).toBeInTheDocument()
  })

  it('MonthPage masthead shows the rhythm h1 and the calendar/motion/done subtitle', () => {
    render(<MonthPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'This Month' })).toBeInTheDocument()
    expect(screen.getByText(/0 on the calendar · 0 in motion · 0 done/)).toBeInTheDocument()
  })

  it("MonthPage shelf header reframes as the month's own list, not a placement queue", () => {
    render(<MonthPage />)
    const monthName = new Date().toLocaleDateString('en-US', { month: 'long' })
    expect(screen.getByText(`${monthName}'s moves (0)`)).toBeInTheDocument()
    expect(screen.queryByText(/^To place/)).not.toBeInTheDocument()
  })

  it('MonthPage renders one surface — shelf, no list sections', () => {
    render(<MonthPage />)
    expect(screen.queryByText(/^Carried over/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Placed this week/)).not.toBeInTheDocument()
    // The shelf is the only pool surface:
    expect(screen.getByRole('button', { name: /tend/i })).toBeInTheDocument()
  })

  it('a bucket-month task renders exactly once — shelf pill, not also in a rail/list', () => {
    mockTasks.push(createMockTask({
      id: 'month-task',
      title: 'Order flowers for the reception',
      bucket: 'month',
    }) satisfies Task)
    render(<MonthPage />)
    expect(screen.getAllByText('Order flowers for the reception')).toHaveLength(1)
  })

  it('dropping a fresh rock (no prior time) onto a grid day marks it all-day', () => {
    mockTasks.push(createMockTask({
      id: 'rock-task',
      title: 'Fresh rock',
      bucket: 'month',
      scheduledFor: undefined,
    }) satisfies Task)
    const { container } = render(<MonthPage />)
    const cell = todayGridCell(container)
    fireEvent.drop(cell, { dataTransfer: { getData: () => 'rock-task' } })
    expect(mockUpdateTask).toHaveBeenCalledWith('rock-task', expect.objectContaining({
      bucket: 'timed',
      isAllDay: true,
    }))
  })

  it('re-dragging an already-timed item between cells preserves its clock time (not all-day)', () => {
    const timedDate = new Date(now)
    timedDate.setDate(timedDate.getDate() - 3)
    timedDate.setHours(14, 30, 0, 0)
    mockTasks.push(createMockTask({
      id: 'timed-task',
      title: 'Timed item',
      bucket: 'timed',
      scheduledFor: timedDate,
    }) satisfies Task)
    const { container } = render(<MonthPage />)
    const cell = todayGridCell(container)
    fireEvent.drop(cell, { dataTransfer: { getData: () => 'timed-task' } })
    const call = mockUpdateTask.mock.calls.find(([id]) => id === 'timed-task')
    expect(call).toBeDefined()
    expect(call![1]).toMatchObject({ bucket: 'timed', isAllDay: false })
    expect((call![1].scheduledFor as Date).getHours()).toBe(14)
    expect((call![1].scheduledFor as Date).getMinutes()).toBe(30)
  })

  it("SeasonPage renders the season's picks panel", () => {
    render(<SeasonPage />)
    expect(screen.getByText("The season's picks")).toBeInTheDocument()
  })

  it('SeasonPage surfaces an active goal with no season pick in the coverage row', () => {
    mockGoals.push({
      id: 'g1', areaId: 'a1', name: 'Financial calm', year: 2026,
      context: null, status: 'active', sortOrder: 0,
      actions: [], milestones: [], createdAt: new Date(), updatedAt: new Date(),
    } satisfies Goal)
    render(<SeasonPage />)
    const heading = screen.getByText('Goals not yet picked this season')
    const section = heading.closest('section')!
    expect(within(section).getByText('Financial calm')).toBeInTheDocument()
  })

  it('SeasonPage hides the coverage row when every active goal has a season pick', () => {
    mockGoals.push({
      id: 'g1', areaId: 'a1', name: 'Financial calm', year: 2026,
      context: null, status: 'active', sortOrder: 0,
      actions: [], milestones: [], createdAt: new Date(), updatedAt: new Date(),
    } satisfies Goal)
    mockTasks.push(createMockTask({
      id: 'pick-1', title: 'A money plan we follow', bucket: 'quarter', goalId: 'g1',
    }) satisfies Task)
    render(<SeasonPage />)
    expect(screen.queryByText('Goals not yet picked this season')).not.toBeInTheDocument()
  })

  it('YearPage renders the plan-the-year door', () => {
    render(<YearPage />)
    // Exact match — "Plan the year together" (the empty-goals invitation) is
    // a distinct button and must not satisfy this assertion.
    expect(screen.getByRole('button', { name: 'Plan the year' })).toBeInTheDocument()
  })

  it('SomedayPage renders the timeless-pool empty state', () => {
    render(<SomedayPage />)
    expect(screen.getByText(/Timeless — review during seasonal planning\./i)).toBeInTheDocument()
  })

  it('WeekPage anchors on `?start=` — header shows that week, not the current one', () => {
    // A MemoryRouter (not the shared test-utils BrowserRouter) so the initial
    // location — and therefore useSearchParams() — is deterministic.
    rtlRender(
      <MemoryRouter initialEntries={['/week?start=2026-07-05']}>
        <PlaceProvider>
          <DomainProvider>
            <WeekPage />
          </DomainProvider>
        </PlaceProvider>
      </MemoryRouter>
    )
    expect(screen.getByText(/Week of Jul 5/)).toBeInTheDocument()
  })

  it('WeekPage anchored on `?start=` shows a task scheduled inside THAT week (reaches the grid)', () => {
    mockTasks.push(createMockTask({
      id: 'anchor-task',
      title: 'Anchored week task',
      scheduledFor: anchorTaskDate,
    }) satisfies Task)

    rtlRender(
      <MemoryRouter initialEntries={[`/week?start=${localYmd(anchorWeekStart)}`]}>
        <PlaceProvider>
          <DomainProvider>
            <WeekPage />
          </DomainProvider>
        </PlaceProvider>
      </MemoryRouter>
    )
    expect(screen.getByText('Anchored week task')).toBeInTheDocument()
  })

  it('the same task is absent when the page is NOT anchored to its week', () => {
    mockTasks.push(createMockTask({
      id: 'anchor-task',
      title: 'Anchored week task',
      scheduledFor: anchorTaskDate,
    }) satisfies Task)

    rtlRender(
      <MemoryRouter initialEntries={['/week']}>
        <PlaceProvider>
          <DomainProvider>
            <WeekPage />
          </DomainProvider>
        </PlaceProvider>
      </MemoryRouter>
    )
    expect(screen.queryByText('Anchored week task')).not.toBeInTheDocument()
  })

  it('a prior-week carried-over task (bucket timed, overdue, not anchored) renders on the shelf, not nowhere', () => {
    const lastWeek = new Date(now)
    lastWeek.setDate(lastWeek.getDate() - 8)
    lastWeek.setHours(9, 0, 0, 0)
    mockTasks.push(createMockTask({
      id: 'carried-task',
      title: 'Carried over from last week',
      bucket: 'timed',
      scheduledFor: lastWeek,
      completed: false,
    }) satisfies Task)

    // Add another overdue task: within current week but scheduled 1 day ago
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(14, 0, 0, 0)
    mockTasks.push(createMockTask({
      id: 'overdue-task',
      title: 'Overdue task from yesterday',
      bucket: 'timed',
      scheduledFor: yesterday,
      completed: false,
    }) satisfies Task)

    render(<WeekPage />)
    expect(screen.getAllByText('Carried over from last week')).toHaveLength(1)
    expect(screen.getAllByText('Overdue task from yesterday')).toHaveLength(1)
  })

  it('navigating from `?start=` back to `/week` resets the header AND the grid to the current week', () => {
    mockTasks.push(
      createMockTask({ id: 'anchor-task', title: 'Anchored week task', scheduledFor: anchorTaskDate }) satisfies Task,
      createMockTask({ id: 'current-task', title: 'Current week task', scheduledFor: currentWeekTaskDate }) satisfies Task,
    )

    function NavAway() {
      const navigate = useNavigate()
      return <button onClick={() => navigate('/week')}>go to plain /week</button>
    }

    rtlRender(
      <MemoryRouter initialEntries={[`/week?start=${localYmd(anchorWeekStart)}`]}>
        <PlaceProvider>
          <DomainProvider>
            <NavAway />
            <WeekPage />
          </DomainProvider>
        </PlaceProvider>
      </MemoryRouter>
    )

    // The header's subtitle always reads "Week of <that week's start>" — for
    // the anchored view AND for the current-week fallback (periodLabel('week')
    // formats the same way) — so the two states are distinguished by WHICH
    // date it names, not by the phrase's presence.
    const anchorLabel = `Week of ${anchorWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    const currentLabel = `Week of ${currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

    // Anchored: the anchor week's task is on the grid, the current week's is not.
    expect(screen.getByText((c) => c.includes(anchorLabel))).toBeInTheDocument()
    expect(screen.getByText('Anchored week task')).toBeInTheDocument()
    expect(screen.queryByText('Current week task')).not.toBeInTheDocument()

    // Same WeekPage instance (no remount of the page) navigates to `/week` —
    // this is exactly the case a one-shot PlanningSession initialDate misses
    // without the `key` remount.
    fireEvent.click(screen.getByText('go to plain /week'))

    expect(screen.queryByText((c) => c.includes(anchorLabel))).not.toBeInTheDocument()
    expect(screen.getByText((c) => c.includes(currentLabel))).toBeInTheDocument()
    expect(screen.getByText('Current week task')).toBeInTheDocument()
    expect(screen.queryByText('Anchored week task')).not.toBeInTheDocument()
  })
})
