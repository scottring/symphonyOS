import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReferenceListsProvider, useReferenceLists } from '@/components/reference/ReferenceListsContext'
import { MemoryRouter, useSearchParams } from 'react-router-dom'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Routine } from '@/types/actionable'
import { DEFAULT_SEASONS, type Seasons } from '@/lib/cadence/seasons'
import { periodStartFor } from '@/lib/placement/model'

// ── Hook mocks: the page is a pure function of these ─────────────────────────
/**
 * A FIXED "today", mid-month, and the clock is pinned to it.
 *
 * These tests read the current month out of the real clock and then assert the
 * page shows it. The page does not always show it: `planningPeriod` looks
 * ahead to the next month once six days or fewer are left. So the whole file
 * went red at 12:00 on 2026-09-24 — a wall-clock boundary, nothing to do with
 * the code — and would do so again on the 24th of every month. Sep 10 leaves
 * three clear weeks, so the page stays where the tests expect it.
 *
 * Only Date is faked; real timers are left alone, or `waitFor` would hang.
 * Blocks that need another date set their own and restore afterwards.
 */
const now = new Date(2026, 8, 10, 9, 0)
const pinClock = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) }
const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
let n = 0
const task = (over: Partial<Task>): Task => ({
  id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 0, 1, 0, 0, n), updatedAt: new Date(), bucket: 'month', ...over,
} as Task)
const goal = (over: Partial<Goal>): Goal => ({
  id: `g${++n}`, areaId: 'a1', name: 'G', year: now.getFullYear(), status: 'active', sortOrder: 0, actions: [], milestones: [],
  createdAt: new Date(), updatedAt: new Date(), context: null, ...over,
} as Goal)

const state: { tasks: Task[]; goals: Goal[]; loading: boolean; goalsLoading?: boolean } = { tasks: [], goals: [], loading: false, goalsLoading: false }
const defaultAddTask = async (..._a: unknown[]): Promise<string | undefined> => 'new'
const hook = {
  toggleTask: vi.fn(), deleteTask: vi.fn(), updateTask: vi.fn(async (..._a: unknown[]) => true), updateTasksBulk: vi.fn(),
  addTask: vi.fn(defaultAddTask), setGoal: vi.fn(), pushTask: vi.fn(),
  keepForward: vi.fn(async (id: string, ..._a: unknown[]): Promise<string | undefined> => id),
  dropCommitment: vi.fn(async (..._a: unknown[]) => true),
  completeTask: vi.fn(async (..._a: unknown[]) => true),
}
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: state.tasks, loading: state.loading, ...hook }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({
  useGatedTaskActions: (raw: Record<string, unknown>) => raw,
}))
const domainState: { layers: Set<string>; soleDomain: string | null } = {
  layers: new Set(['work', 'family', 'personal', 'unsorted']), soleDomain: null,
}
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ layers: domainState.layers, soleDomain: domainState.soleDomain }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ getCurrentUserMember: () => ({ id: 'me' }) }) }))
const seasonsState: { seasons: Seasons; loading: boolean } = { seasons: DEFAULT_SEASONS, loading: false }
vi.mock('@/hooks/useHouseholdSeasons', () => ({
  useHouseholdSeasons: () => ({ seasons: seasonsState.seasons, loading: seasonsState.loading, canEdit: true, setSeasons: vi.fn() }),
}))
const routinesState: { routines: Routine[] } = { routines: [] }
vi.mock('@/hooks/useRoutines', () => ({
  useRoutines: () => ({ activeRoutines: routinesState.routines, routines: routinesState.routines, loading: false }),
}))
const routine = (over: Partial<Routine>): Routine => ({
  id: `r${++n}`, name: 'R', is_active: true, recurrence_pattern: { type: 'weekly' }, visibility: 'active',
  context: 'family', scope: 'compound',
  ...over,
} as Routine)
const goalsApi = {
  addGoal: vi.fn(async (_a: string, name: string) => goal({ name })), updateGoal: vi.fn(), deleteGoal: vi.fn(), addArea: vi.fn(async () => ({ id: 'a1' })),
}
vi.mock('@/contexts/GoalsContext', () => ({
  GoalsProvider: ({ children }: { children: React.ReactNode }) => children,
  useGoalsContext: () => ({ goals: state.goals, areas: [{ id: 'a1', name: 'General' }], loading: state.goalsLoading ?? false, ...goalsApi }),
}))
vi.mock('@/lib/today/domainFilter', () => ({
  filterTasksForLayers: (t: Task[]) => t,
  matchesLayers: () => true,
}))
const sessionState: { saved: null | { at: Date; authorId: string; notes: object }; mine: null | { wentWell: string; didnt: string }; loadedToken: string | null | 'auto'; error: string | null; loading: boolean } = { saved: null, mine: null, loadedToken: 'auto', error: null, loading: false }
const saveSession = vi.fn(async (..._a: unknown[]) => true)
const reloadSession = vi.fn()
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: (_h: string, token: string) => ({ saved: sessionState.saved, mine: sessionState.mine, loading: sessionState.loading,
    loadedToken: sessionState.loadedToken === 'auto' ? token : sessionState.loadedToken, error: sessionState.error, reload: reloadSession, save: saveSession }),
  monthToken: (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`,
  yearToken: (y: number) => String(y),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
// The day tiles' two sources, held flat so a case can make one unavailable.
const dayLoad = { events: [] as unknown[], available: true, loading: false }
vi.mock('@/hooks/useDayLoadEvents', () => ({
  DAY_LOAD_RANGE_DAYS: 45,
  DAY_LOAD_BACK_DAYS: 7,
  useDayLoadEvents: () => dayLoad,
}))
vi.mock('@/components/home/week/useWeekInstances', () => ({ useWeekInstances: () => [] }))
// One confirmation per gesture, with its Undo — asserted rather than assumed.
const toastSpy = vi.fn()
vi.mock('@/hooks/useToast', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showToast: (...args: unknown[]) => toastSpy(...args),
}))
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => mockNavigate,
}))

import { PeriodPlanPage } from './PeriodPlanPage'

const renderPage = (level: 'month' | 'season' | 'year') =>
  render(<MemoryRouter><PeriodPlanPage level={level} /></MemoryRouter>)
const renderPageAt = (level: 'month' | 'season' | 'year', path: string) =>
  render(<MemoryRouter initialEntries={[path]}><PeriodPlanPage level={level} /></MemoryRouter>)

describe('PeriodPlanPage', () => {
  afterEach(() => { vi.useRealTimers() })
  beforeEach(() => {
    pinClock()
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    localStorage.clear()
    Object.values(hook).forEach((f) => f.mockClear())
    Object.values(goalsApi).forEach((f) => f.mockClear())
    mockNavigate.mockClear()
    toastSpy.mockClear()
  })

  it('renders contextual shelves into the shared dock only while opened', () => {
    function DockHarness() {
      const refs = useReferenceLists()!
      const opened = refs.pins.some((p) => p.kind === 'today')
      return <>
        <button onClick={() => refs.pin('today')}>Open test shelves</button>
        {opened && <div data-testid="shelves-slot" ref={refs.setShelvesTarget} />}
        <PeriodPlanPage level="month" />
      </>
    }
    render(<MemoryRouter><ReferenceListsProvider userId="period-dock-test"><DockHarness /></ReferenceListsProvider></MemoryRouter>)
    expect(screen.queryByRole('complementary', { name: 'Shelves' })).toBeNull()
    fireEvent.click(screen.getByText('Open test shelves'))
    const slot = screen.getByTestId('shelves-slot')
    expect(within(slot).getByRole('complementary', { name: 'Shelves' })).toBeInTheDocument()
    expect(within(slot).getByRole('complementary', { name: 'This Season' })).toBeInTheDocument()
    fireEvent.click(within(slot).getByRole('button', { name: 'Close shelves' }))
    expect(screen.queryByTestId('shelves-slot')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Month goals' })).toBeInTheDocument()
  })

  it("This Month: goals first, then tasks, each under its own heading; Iris's rows stay out", () => {
    const placed = task({ title: 'Repaint the porch', monthStart: thisMonth })
    state.tasks = [
      placed,
      task({ title: 'Read more', monthStart: thisMonth, isGoal: true }),
      task({ title: 'Repaint the porch', bucket: 'week', sourceId: placed.id, weekStart: new Date(now.getFullYear(), now.getMonth(), 13) }),
      task({ title: "Iris's thing", monthStart: thisMonth, assignedTo: 'iris' }),
      task({ title: 'Legacy row' }),
    ]
    renderPage('month')
    const monthName = now.toLocaleDateString('en-US', { month: 'long' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(monthName)

    // Two lists, each saying what it is — not one list where an icon was the
    // only tell. Goals come first, and the goal is in the GOALS list.
    const goals = screen.getByRole('region', { name: /goals$/ })
    const list = screen.getByRole('region', { name: /list$/ })
    expect(within(goals).getByRole('heading', { name: 'Month goals' })).toBeInTheDocument()
    expect(within(list).getByRole('heading', { name: 'Month tasks' })).toBeInTheDocument()
    expect(goals.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(goals).getByText('Read more')).toBeInTheDocument()
    expect(within(list).queryByText('Read more')).not.toBeInTheDocument()

    expect(within(list).getByText('Legacy row')).toBeInTheDocument()
    expect(within(list).queryByText("Iris's thing")).not.toBeInTheDocument()
    expect(within(goals).queryByText("Iris's thing")).not.toBeInTheDocument()
  })

  it('a goal carries one line of intent from its notes; a task stays one line', () => {
    state.tasks = [
      task({ title: 'A home easier to care for', monthStart: thisMonth, isGoal: true, notes: '## Why\nMake progress on the repairs we keep putting off.\n\nmore detail' }),
      task({ title: 'Fix up holes in wall', monthStart: thisMonth, notes: 'bathroom and stairs' }),
    ]
    renderPage('month')
    expect(screen.getByText('Make progress on the repairs we keep putting off.')).toBeInTheDocument()
    // The markdown heading above it is not the intent line.
    expect(screen.queryByText('## Why')).not.toBeInTheDocument()
    expect(screen.queryByText('Why')).not.toBeInTheDocument()
    // A task's notes stay on the task's own page.
    expect(screen.queryByText('bathroom and stairs')).not.toBeInTheDocument()
  })

  // One enduring action (2026-09-21): a month row taken into a week is the
  // SAME row carrying a week commitment. It stays on the month list, says
  // where the work went, and the status opens the row itself.
  it('keeps assigned tasks in a separate fold without using the available-task preview', () => {
    const wk = new Date(now.getFullYear(), now.getMonth(), 13)
    state.tasks = [
      task({ title: 'Already in a week', bucket: 'week', weekStart: wk, monthStart: thisMonth, commitments: [
        { level: 'month', periodStart: thisMonth, status: 'open' },
        { level: 'week', periodStart: wk, status: 'open' },
      ] }),
      ...Array.from({ length: 6 }, (_, i) => task({ title: `Available ${i}`, monthStart: thisMonth })),
    ]
    renderPage('month')
    const assigned = screen.getByText('Already in a week').closest('details')
    expect(assigned).not.toHaveAttribute('open')
    expect(assigned).toHaveTextContent('Already assigned · 1')
    expect(screen.getByText('Available 4')).toBeInTheDocument()
    expect(screen.queryByText('Available 5')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all 6 — 1 more' }))
    expect(screen.getByText('Available 5')).toBeInTheDocument()
    expect(hook.pushTask).not.toHaveBeenCalled()
  })

  it('a placed row says ONE thing — where the work went — and follows to it', () => {
    const wk = new Date(now.getFullYear(), now.getMonth(), 13)
    const row = task({ title: 'Repaint the porch', bucket: 'week', weekStart: wk, monthStart: thisMonth, commitments: [
      { level: 'month', periodStart: thisMonth, status: 'open' },
      { level: 'week', periodStart: wk, status: 'open' },
    ] })
    state.tasks = [row]
    renderPage('month')
    const list = screen.getByRole('region', { name: /list$/ })
    // The competing "→ placed" / "→ done" pair is gone.
    expect(within(list).queryByText('→ placed')).not.toBeInTheDocument()
    expect(within(list).queryByText('→ done')).not.toBeInTheDocument()
    const status = within(list).getByText(/September 13–19|September 13 – /)
    fireEvent.click(status)
    expect(mockNavigate).toHaveBeenCalledWith(`/task/${row.id}`)
  })

  it('a placed row that was finished reads as finished, and can be reopened here — it is the row that did the work', () => {
    state.tasks = [
      task({ title: 'Trade in the bike', bucket: 'week', monthStart: thisMonth, completed: true, commitments: [
        { level: 'month', periodStart: thisMonth, status: 'done' },
        { level: 'week', periodStart: new Date(now.getFullYear(), now.getMonth(), 13), status: 'done' },
      ] }),
    ]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Completed this month/ }))
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reopen Trade in the bike/ })).not.toBeDisabled()
  })

  it('a task you completed HERE can be reopened from its own tick', () => {
    state.tasks = [task({ title: 'Book dentist', monthStart: thisMonth, completed: true })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Completed this month/ }))
    const tick = screen.getByRole('button', { name: 'Reopen Book dentist' })
    expect(tick).not.toBeDisabled()
    fireEvent.click(tick)
    expect(hook.toggleTask).toHaveBeenCalledWith(state.tasks[0].id)
  })

  it('a goal you completed can be reopened from its own tick', () => {
    state.goals = [goal({ name: 'Read more', status: 'completed' })]
    renderPage('year')
    expect(screen.getByText('Read more').closest('details')).not.toHaveAttribute('open')
    const tick = screen.getByRole('button', { name: 'Reopen Read more' })
    expect(tick).not.toBeDisabled()
    fireEvent.click(tick)
    expect(goalsApi.updateGoal).toHaveBeenCalledWith(state.goals[0].id, { status: 'active' })
  })

  it("never dresses a row's SCHEDULED date up as the day it was done", () => {
    const scheduledFor = new Date(now.getFullYear(), now.getMonth(), 15, 9, 0)
    state.tasks = [
      task({ title: 'Fix the gate', bucket: 'timed', scheduledFor, monthStart: thisMonth, completed: true, commitments: [
        { level: 'month', periodStart: thisMonth, status: 'done' },
      ] }),
    ]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Completed this month/ }))
    const day = scheduledFor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    expect(screen.queryByText(`done ${day}`)).not.toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('lists the month\'s routine PATTERNS in the reference column — no checkboxes', () => {
    routinesState.routines = [
      routine({ name: 'Kitchen laundry', recurrence_pattern: { type: 'monthly' } }),
      routine({ name: 'Family planning', recurrence_pattern: { type: 'monthly', day_of_month: 3 } }),
    ]
    renderPage('month')
    const panel = screen.getByRole('region', { name: 'Recurring commitments' })
    // Folded by default, with a count.
    expect(within(panel).queryByText('Kitchen laundry')).not.toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: /Recurring commitments/ }))
    expect(within(panel).getByText('Kitchen laundry')).toBeInTheDocument()
    expect(within(panel).getByText(/Every month/)).toBeInTheDocument()
    // describeRecurrence is the app's one cadence vocabulary — the page does
    // not invent a second one.
    expect(within(panel).getByText(/Monthly on the 3rd/)).toBeInTheDocument()
    // A pattern is reference: nothing here can be ticked off.
    expect(within(panel).queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('checkbox')).not.toBeInTheDocument()
    // Each entry opens the routine itself.
    fireEvent.click(within(panel).getByText('Kitchen laundry'))
    expect(mockNavigate).toHaveBeenCalledWith(`/routines/${routinesState.routines[0].id}`)
  })

  it('only the CURRENT period claims the routines are its own — there is no routine history', () => {
    routinesState.routines = [routine({ name: 'Kitchen laundry', recurrence_pattern: { type: 'monthly' } })]
    renderPage('month')
    expect(screen.getByRole('region', { name: 'Recurring commitments' })).toBeInTheDocument()
    // Page back: the same patterns are all we know, so the heading stops
    // claiming they were August's.
    fireEvent.click(screen.getByRole('button', { name: `Review ${lastMonth.toLocaleDateString('en-US', { month: 'long' })}` }))
    expect(screen.queryByRole('region', { name: 'Recurring commitments' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Current recurring commitments' })).toBeInTheDocument()
  })

  it('year shelves exclude faster routine patterns', () => {
    routinesState.routines = [routine({ name: 'Kitchen laundry', recurrence_pattern: { type: 'monthly' } })]
    renderPage('year')
    expect(screen.queryByRole('region', { name: /recurring commitments$/i })).not.toBeInTheDocument()
  })

  it('finished work waits behind a fold — the working list is what is left to do', () => {
    state.tasks = [
      task({ title: 'Fix the light in the kitchen', monthStart: thisMonth, completed: true }),
      task({ title: 'Fix up holes in wall', monthStart: thisMonth }),
    ]
    renderPage('month')
    const list = screen.getByRole('region', { name: /list$/ })
    expect(within(list).getByText('Fix up holes in wall')).toBeInTheDocument()
    expect(within(list).queryByText('Fix the light in the kitchen')).not.toBeInTheDocument()

    const fold = screen.getByRole('button', { name: /Completed this month/ })
    expect(fold.textContent).toContain('1')
    fireEvent.click(fold)
    expect(screen.getByText('Fix the light in the kitchen')).toBeInTheDocument()
  })

  it('a look-back opens its finished work — that is what a look-back is about', () => {
    state.tasks = [task({ title: 'Washed the car', monthStart: lastMonth, completed: true })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Review ${lastMonth.toLocaleDateString('en-US', { month: 'long' })}` }))
    // No click needed: on a past period the finished work is already showing.
    expect(screen.getByText('Washed the car')).toBeInTheDocument()
  })

  it('hiding finished work STICKS — across periods and across visits', () => {
    state.tasks = [
      task({ title: 'Washed the car', monthStart: lastMonth, completed: true }),
      task({ title: 'Fix the light', monthStart: thisMonth, completed: true }),
    ]
    const first = renderPage('month')
    // This month: collapsed by default — the plan is about what is left.
    expect(screen.queryByText('Fix the light')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Completed this month/ }))
    expect(screen.getByText('Fix the light')).toBeInTheDocument()
    first.unmount()

    // The choice survives the next visit.
    renderPage('month')
    expect(screen.getByText('Fix the light')).toBeInTheDocument()
    // …and closing it survives too, even on a look-back, where the default
    // would otherwise be open.
    fireEvent.click(screen.getByRole('button', { name: /Completed this month/ }))
    fireEvent.click(screen.getByRole('button', { name: `Review ${lastMonth.toLocaleDateString('en-US', { month: 'long' })}` }))
    expect(screen.queryByText('Washed the car')).not.toBeInTheDocument()
  })

  it('shows the first five tasks and offers the rest — and that choice sticks', () => {
    state.tasks = Array.from({ length: 8 }, (_, i) => task({ title: `Task ${i + 1}`, monthStart: thisMonth }))
    const first = renderPage('month')
    const list = screen.getByRole('region', { name: /list$/ })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    expect(within(list).getByText('Task 5')).toBeInTheDocument()
    expect(within(list).queryByText('Task 6')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show all 8 — 3 more' }))
    expect(within(screen.getByRole('region', { name: /list$/ })).getAllByRole('listitem')).toHaveLength(8)
    first.unmount()

    // Still expanded next visit, and collapsible back to five.
    renderPage('month')
    expect(within(screen.getByRole('region', { name: /list$/ })).getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Show the first 5' }))
    expect(within(screen.getByRole('region', { name: /list$/ })).getAllByRole('listitem')).toHaveLength(5)
  })

  it('a list that fits is not asked about', () => {
    state.tasks = Array.from({ length: 5 }, (_, i) => task({ title: `Task ${i + 1}`, monthStart: thisMonth }))
    renderPage('month')
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show the first/ })).not.toBeInTheDocument()
  })

  it('the cap counts only what is LEFT to do — finished work is already hidden', () => {
    state.tasks = [
      ...Array.from({ length: 4 }, (_, i) => task({ title: `Open ${i + 1}`, monthStart: thisMonth })),
      ...Array.from({ length: 6 }, (_, i) => task({ title: `Done ${i + 1}`, monthStart: thisMonth, completed: true })),
    ]
    renderPage('month')
    // Four open rows is under the cap, so nothing is elided despite ten rows.
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Completed this month/ }).textContent).toContain('6')
  })

  // The month page's rung below is the WEEK, and the timing control chooses
  // weeks by name — so the "Take it into this week" shortcut is redundant AND
  // wrong from any month that is not the current one: it means the week
  // containing now, and on a November row it filed the task into September
  // (Codex live test, 2026-09-24). The control replaces it.
  it('a month row is not offered the week shortcut — the timing control names the week', () => {
    const t = task({ title: 'Fix the back door', monthStart: thisMonth })
    state.tasks = [t]
    renderPage('month')
    expect(screen.queryByRole('button', { name: /Take it into this week/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choose a week or a day for Fix the back door/ })).toBeInTheDocument()
  })

  it('a month row still goes straight to today', () => {
    const t = task({ title: 'Fix the back door', monthStart: thisMonth })
    state.tasks = [t]
    renderPage('month')
    // Today (S4) dates it today AND chooses it; the placement module keeps
    // its month commitment.
    fireEvent.click(screen.getByRole('button', { name: 'Do it today Fix the back door' }))
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
    expect(hook.updateTask).toHaveBeenLastCalledWith(t.id, { bucket: 'timed', scheduledFor: midnight, isAllDay: true, plannedOn: midnight })
    expect(hook.pushTask).not.toHaveBeenCalled()
  })

  it('a season row goes into the MONTH — each page names the rung below it', () => {
    const t = task({ title: 'Swap the closets', bucket: 'quarter', seasonStart: undefined })
    state.tasks = [t]
    renderPage('season')
    fireEvent.click(screen.getByRole('button', { name: 'Take it into this month Swap the closets' }))
    expect(hook.pushTask).toHaveBeenCalledWith(t.id, 'month')
  })

  it('a goal is never offered a rung', () => {
    state.tasks = [task({ title: 'A home easier to care for', monthStart: thisMonth, isGoal: true })]
    renderPage('month')
    expect(screen.queryByRole('button', { name: /Take it into/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Do it today/ })).not.toBeInTheDocument()
  })

  it('the page says whose plan it is, and offers the period just ended', () => {
    renderPage('month')
    expect(screen.getByText(/Everyone/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(`Review ${lastMonth.toLocaleDateString('en-US', { month: 'long' })}`) })).toBeInTheDocument()
  })

  it('the calendar is a fold BENEATH the plan — closed until you open it (Scott, 2026-09-13)', () => {
    const scheduledFor = new Date(now.getFullYear(), now.getMonth(), 15, 18, 30)
    const dated = task({ title: 'Back to school night', scheduledFor, bucket: 'week' })
    state.tasks = [dated]
    renderPage('month')
    const expectedDate = scheduledFor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const expectedTime = scheduledFor.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    expect(screen.getByRole('heading', { name: 'On the calendar' })).toBeInTheDocument()
    // Closed: the plan greets you, the calendar waits.
    expect(screen.queryByText(`${expectedDate} · Back to school night · ${expectedTime}`)).not.toBeInTheDocument()
    // …and the plan comes first in the document.
    const plan = screen.getByRole('region', { name: /list$/ })
    const calendar = screen.getByRole('region', { name: 'On the calendar' })
    expect(plan.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /On the calendar/ }))
    expect(screen.getByText(`${expectedDate} · Back to school night · ${expectedTime}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${expectedDate} · Back to school night`) }))
    expect(mockNavigate).toHaveBeenCalledWith(`/task/${dated.id}`)
  })

  it('an all-day dated item shows no time, and the fold is absent when nothing is dated', () => {
    renderPage('month')
    expect(screen.queryByRole('heading', { name: 'On the calendar' })).not.toBeInTheDocument()
    const scheduledFor = new Date(now.getFullYear(), now.getMonth(), 15)
    state.tasks = [task({ title: 'Picture day', scheduledFor, isAllDay: true, bucket: 'week' })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /On the calendar/ }))
    const expectedDate = scheduledFor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    expect(screen.getByText(`${expectedDate} · Picture day`)).toBeInTheDocument()
  })

  it('folds the season beneath the month list, with → this month on open tasks once unfolded', () => {
    state.tasks = [task({ title: 'Fall trips', bucket: 'quarter' })]
    renderPage('month')
    const rail = screen.getByRole('complementary', { name: 'This Season' })
    // Closed by default — a reference you unfold, not a second list.
    expect(within(rail).queryByText('Fall trips')).not.toBeInTheDocument()
    fireEvent.click(within(rail).getByRole('button', { name: /This Season/ }))
    expect(within(rail).getByText('Fall trips')).toBeInTheDocument()
    fireEvent.click(within(rail).getByRole('button', { name: 'Add to this month: Fall trips' }))
    // Names the month being VIEWED. It used to send pushTask(id, 'month') with
    // no stamp, so planPlacement filled it from the clock and a Fall task
    // pulled down while October was on screen landed on September (S3-01).
    expect(hook.updateTask).toHaveBeenCalledWith(
      expect.any(String), { bucket: 'month', monthStart: thisMonth },
    )
    expect(hook.pushTask).not.toHaveBeenCalled()
  })

  it('"Add to this month" names the VIEWED month, not the clock\u2019s (S3-01)', () => {
    state.tasks = [task({ title: 'Fall trips', bucket: 'quarter' })]
    renderPageAt('month', '/month?start=2026-10-01')
    const rail = screen.getByRole('complementary', { name: 'This Season' })
    fireEvent.click(within(rail).getByRole('button', { name: /This Season/ }))
    fireEvent.click(within(rail).getByRole('button', { name: 'Add to this month: Fall trips' }))
    expect(hook.updateTask).toHaveBeenCalledWith(
      expect.any(String), { bucket: 'month', monthStart: new Date(2026, 9, 1) },
    )
  })

  it('the current period offers completion without converting task identity', () => {
    state.tasks = [task({ title: 'Repaint', monthStart: thisMonth })]
    renderPage('month')
    expect(screen.getByRole('button', { name: 'Complete Repaint' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make it a goal Repaint' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep Repaint' })).not.toBeInTheDocument()
    expect(hook.setGoal).not.toHaveBeenCalled()
  })

  // The look-back: page to last month → every row shows its fate and offers
  // keep / someday / drop; Keep copies into the NEXT period (this month).
  it('last month is a look-back with keep, someday, drop', () => {
    const open = task({ title: 'Call the plumber', monthStart: lastMonth })
    state.tasks = [open, task({ title: 'Washed the car', monthStart: lastMonth, completed: true })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Review ${lastMonth.toLocaleDateString('en-US', { month: 'long' })}` }))
    expect(screen.getByText(/Look back/)).toBeInTheDocument()
    expect(screen.getByText('Washed the car')).toHaveClass('line-through')
    fireEvent.click(screen.getByRole('button', { name: 'Keep Call the plumber' }))
    expect(hook.keepForward).toHaveBeenCalledWith(open.id, { monthStart: thisMonth }, lastMonth)
    fireEvent.click(screen.getByRole('button', { name: 'Someday Call the plumber' }))
    expect(hook.updateTask).toHaveBeenCalledWith(open.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Drop Call the plumber' }))
    // A past month's Drop ends that month's commitment; the task is kept.
    expect(hook.dropCommitment).toHaveBeenCalledWith(open.id, 'month', lastMonth)
    expect(hook.deleteTask).not.toHaveBeenCalled()
    // no composer on a past period
    expect(screen.queryByLabelText('Add to this month')).not.toBeInTheDocument()
  })

  it('each list has its own add — no mode to set before typing', () => {
    const monthName = now.toLocaleDateString('en-US', { month: 'long' })
    renderPage('month')
    const input = screen.getByLabelText('Add to this month')
    fireEvent.change(input, { target: { value: 'Repaint the porch' } })
    fireEvent.submit(input.closest('form')!)
    expect(hook.addTask).toHaveBeenCalledWith('Repaint the porch', undefined, undefined, undefined,
      expect.objectContaining({ bucket: 'month', monthStart: thisMonth, isGoal: false }))
    // The goals list has its own "+", and what you type there IS a goal.
    fireEvent.click(screen.getByRole('button', { name: `Add a goal for ${monthName}` }))
    const goalInput = screen.getByLabelText(`New goal for ${monthName}`)
    fireEvent.change(goalInput, { target: { value: 'Read more' } })
    fireEvent.submit(goalInput.closest('form')!)
    expect(hook.addTask).toHaveBeenLastCalledWith('Read more', undefined, undefined, undefined,
      expect.objectContaining({ bucket: 'month', isGoal: true }))
  })

  // The first real walkthrough stalled here: a blank /year read as "nothing to
  // do". An empty period asks its question up front; the link only toggles the
  // composer once there is a list to keep tidy.
  it('an empty period opens with the goal question already asked', () => {
    state.goals = []
    renderPage('year')
    const input = screen.getByPlaceholderText('What do you want from this year?')
    expect(input).toBeInTheDocument()
    expect(screen.queryByText(/No goals for this year yet/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Add a goal for ${now.getFullYear()}` }))
    expect(screen.getByPlaceholderText('What do you want from this year?')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'Move the family to a bigger house' } })
    fireEvent.submit(input.closest('form')!)
    expect(goalsApi.addGoal).toHaveBeenCalled()
  })

  it('This Year lists the goals, with the year rail absent and a goal look-back', () => {
    state.goals = [goal({ name: 'Run a half marathon' }), goal({ name: 'Old goal', year: now.getFullYear() - 1, status: 'completed' })]
    renderPage('year')
    expect(screen.getByRole('heading', { name: String(now.getFullYear()) })).toBeInTheDocument()
    expect(screen.getByText('Run a half marathon')).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'This Year' })).not.toBeInTheDocument()
    // no Someday for a goal, ever
    fireEvent.click(screen.getByRole('button', { name: `Review ${now.getFullYear() - 1}` }))
    expect(screen.getByText('Old goal')).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: /Someday/ })).not.toBeInTheDocument()
  })

  it('This Season lists quarter rows with the year goals folded beneath', () => {
    state.tasks = [task({ title: 'Fall trips', bucket: 'quarter' })]
    state.goals = [goal({ name: 'Run a half marathon' })]
    renderPage('season')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/\d{4}$/)
    expect(within(screen.getByRole('region', { name: /list$/ })).getByText('Fall trips')).toBeInTheDocument()
    const rail = screen.getByRole('complementary', { name: 'This Year' })
    fireEvent.click(within(rail).getByRole('button', { name: /This Year/ }))
    expect(within(rail).getByText('Run a half marathon')).toBeInTheDocument()
    // the year rail is look-only
    expect(within(rail).queryByRole('button', { name: /Add to/ })).not.toBeInTheDocument()
  })

  // S3-02: the season session offers "For a <year> goal?" and the summary says
  // "for <that goal>" — but the link was never written, so the saved season
  // goal came back with goal_id null. A season's rail IS the goals table, so
  // the pick lands straight on goal_id.
  it('a season goal created FOR a year goal is saved carrying that year goal', async () => {
    state.goals = [goal({ id: 'yg1', name: 'Run a half marathon' })]
    renderPage('season')
    const label = screen.getByRole('region', { name: / list$/ }).getAttribute('aria-label')!.replace(/ list$/, '')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.change(screen.getByLabelText(new RegExp(`new goal for ${label}`, 'i')), { target: { value: 'A home easier to care for' } })
    fireEvent.change(screen.getByLabelText(/for a \d{4} goal/i), { target: { value: 'yg1' } })
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.addTask).toHaveBeenCalledWith('A home easier to care for', undefined, undefined, undefined,
      expect.objectContaining({ bucket: 'quarter', isGoal: true, goalId: 'yg1' }))
  })

  // The month rail is the SEASON's goals, so the pick is a task, not a
  // goals-table row. It has to keep WHICH season goal was chosen — recording
  // only the annual goal loses the reason that seasonal goal was picked.
  it('a month goal created FOR a season goal records that season goal, and inherits its year goal', async () => {
    const seasonStart = periodStartFor('season', new Date(), DEFAULT_SEASONS)
    state.tasks = [task({ id: 'sg1', title: 'A season of repairs', isGoal: true, bucket: 'quarter', seasonStart, goalId: 'yg1' })]
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.change(screen.getByLabelText(new RegExp(`new goal for ${label}`, 'i')), { target: { value: 'A home easier to care for' } })
    fireEvent.change(screen.getByLabelText(/for a season goal/i), { target: { value: 'sg1' } })
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.addTask).toHaveBeenCalledWith('A home easier to care for', undefined, undefined, undefined,
      expect.objectContaining({ bucket: 'month', isGoal: true, supportsGoalTaskId: 'sg1', goalId: 'yg1' }))
    // Never goalTaskId: that would make the month goal a STEP of the season
    // goal, and steps are carried along when their goal moves.
    const opts = hook.addTask.mock.calls.at(-1)![4] as { goalTaskId?: string }
    expect(opts.goalTaskId).toBeUndefined()
  })

  // Both ends, each on its own page. A parent that only ever appeared on its
  // children's rows would be a dead end.
  it('the month goal names the season goal it supports, and links to it', () => {
    const seasonStart = periodStartFor('season', new Date(), DEFAULT_SEASONS)
    state.tasks = [
      task({ id: 'sg1', title: 'A season of repairs', isGoal: true, bucket: 'quarter', seasonStart }),
      task({ id: 'mg1', title: 'A home easier to care for', isGoal: true, monthStart: thisMonth, supportsGoalTaskId: 'sg1' }),
    ]
    renderPage('month')
    const goalsCard = screen.getByRole('region', { name: /goals$/ })
    expect(within(goalsCard).getByText('Supports')).toBeInTheDocument()
    fireEvent.click(within(goalsCard).getByRole('button', { name: 'Open A season of repairs' }))
    expect(mockNavigate).toHaveBeenCalledWith('/task/sg1')
  })

  it('the season goal names the month goals supporting it, and links to them', () => {
    const seasonStart = periodStartFor('season', new Date(), DEFAULT_SEASONS)
    state.tasks = [
      task({ id: 'sg1', title: 'A season of repairs', isGoal: true, bucket: 'quarter', seasonStart }),
      task({ id: 'mg1', title: 'A home easier to care for', isGoal: true, monthStart: thisMonth, supportsGoalTaskId: 'sg1' }),
    ]
    renderPage('season')
    const goalsCard = screen.getByRole('region', { name: /goals$/ })
    expect(within(goalsCard).getByText('Supported by')).toBeInTheDocument()
    fireEvent.click(within(goalsCard).getByRole('button', { name: 'Open A home easier to care for' }))
    expect(mockNavigate).toHaveBeenCalledWith('/task/mg1')
  })

  it('a year goal names the season goals supporting it', () => {
    const seasonStart = periodStartFor('season', new Date(), DEFAULT_SEASONS)
    state.goals = [goal({ id: 'yg1', name: 'Make the house ours' })]
    state.tasks = [task({ id: 'sg1', title: 'A season of repairs', isGoal: true, bucket: 'quarter', seasonStart, goalId: 'yg1' })]
    renderPage('year')
    const goalsCard = screen.getByRole('region', { name: /goals$/ })
    expect(within(goalsCard).getByText('Supported by')).toBeInTheDocument()
    expect(within(goalsCard).getByRole('button', { name: 'Open A season of repairs' })).toBeInTheDocument()
  })

  // ── The timing control (connected planning, 2026-09-24) ────────────────
  // "When have I chosen to do this?" must be answerable from the row. The
  // control wears the saved answer instead of a verb, a goal's STEPS get one
  // as much as loose work does, and the season page gets one at all — it
  // returned null for anything but a month.
  describe('timing on a period row', () => {
    const timingBtn = (title: string) =>
      screen.getByRole('button', { name: new RegExp(`Choose a week or a day for ${title}`) })

    it('states no choice, a chosen week, and a chosen day — on a goal\'s own steps', () => {
      state.tasks = [
        task({ id: 'g1', title: 'Islanders game', isGoal: true, monthStart: thisMonth }),
        task({ id: 's1', title: 'Research tickets', monthStart: thisMonth, goalTaskId: 'g1' }),
        task({ id: 's2', title: 'Buy tickets', monthStart: thisMonth, goalTaskId: 'g1',
          commitments: [{ level: 'month', periodStart: thisMonth, status: 'open' },
            { level: 'week', periodStart: new Date(2026, 8, 20), status: 'open' }] }),
        task({ id: 's3', title: 'Call the box office', monthStart: thisMonth, goalTaskId: 'g1',
          bucket: 'timed', scheduledFor: new Date(2026, 8, 22), isAllDay: true,
          commitments: [{ level: 'month', periodStart: thisMonth, status: 'open' }] }),
      ]
      renderPage('month')
      fireEvent.click(screen.getByRole('button', { name: /Show steps under Islanders game/ }))
      expect(timingBtn('Research tickets')).toHaveTextContent('Choose when')
      expect(timingBtn('Buy tickets')).toHaveTextContent('Sep 20 – Sep 26 · any day')
      expect(timingBtn('Call the box office')).toHaveTextContent('Tue, Sep 22 · any time')
    })

    it('offers the control on a SEASON row, which had none at all', () => {
      const seasonStart = periodStartFor('season', new Date(), DEFAULT_SEASONS)
      state.tasks = [task({ id: 'q1', title: 'Fall trips', bucket: 'quarter', seasonStart })]
      renderPage('season')
      expect(timingBtn('Fall trips')).toBeInTheDocument()
    })

    it('choosing a week writes that week and leaves the goal and the month alone', () => {
      state.tasks = [
        task({ id: 'g1', title: 'Islanders game', isGoal: true, monthStart: thisMonth }),
        task({ id: 's1', title: 'Research tickets', monthStart: thisMonth, goalTaskId: 'g1' }),
      ]
      renderPage('month')
      fireEvent.click(screen.getByRole('button', { name: /Show steps under Islanders game/ }))
      fireEvent.click(timingBtn('Research tickets'))
      const weeks = screen.getAllByRole('menuitemradio')
      fireEvent.click(weeks[1])
      const [, updates] = hook.updateTask.mock.calls.at(-1) as [string, Record<string, unknown>]
      expect(updates.bucket).toBe('week')
      expect(updates.weekStart).toBeInstanceOf(Date)
      expect('goalTaskId' in updates).toBe(false)
      expect('monthStart' in updates).toBe(false)
    })

    // At the season: removing the week releases the WEEK and leaves the season
    // commitment standing, naming no month the row was never on. The write
    // states the commitments outright — a bucket and a dropped stamp left the
    // week open behind it (Codex review, 2026-09-24).
    it('removing a season row\'s week releases the week and keeps the season', async () => {
      const seasonStart = periodStartFor('season', new Date(), DEFAULT_SEASONS)
      state.tasks = [task({ id: 'q1', title: 'Fall trips', bucket: 'quarter', seasonStart,
        commitments: [{ level: 'season', periodStart: seasonStart, status: 'open' },
          { level: 'week', periodStart: new Date(2026, 8, 20), status: 'open' }] })]
      renderPage('season')
      fireEvent.click(timingBtn('Fall trips'))
      fireEvent.click(screen.getByRole('menuitem', { name: /^Remove week/ }))
      await vi.waitFor(() => expect(hook.updateTask).toHaveBeenCalled())
      const [, updates] = hook.updateTask.mock.calls.at(-1) as [string, Record<string, unknown>]
      const commitments = updates.commitments as { level: string; periodStart: Date; status: string }[]
      expect(commitments.some((c) => c.level === 'week' && c.status === 'open')).toBe(false)
      expect(commitments).toContainEqual({ level: 'season', periodStart: seasonStart, status: 'open' })
      expect('monthStart' in updates).toBe(false)
      expect('bucket' in updates).toBe(false)
    })

    // Requirement 6: the consequence is readable BEFORE the press, and the
    // two removals are different gestures with different survivors.
    it('says what each removal leaves behind, before it is pressed', () => {
      state.tasks = [task({ id: 'a1', title: 'Buy tickets', monthStart: thisMonth,
        bucket: 'timed', scheduledFor: new Date(2026, 8, 22), isAllDay: true,
        commitments: [{ level: 'month', periodStart: thisMonth, status: 'open' },
          { level: 'week', periodStart: new Date(2026, 8, 20), status: 'open' }] })]
      renderPage('month')
      fireEvent.click(timingBtn('Buy tickets'))
      const removeDay = screen.getByRole('menuitem', { name: /^Remove Tue, Sep 22/ })
      expect(removeDay).toHaveTextContent('Keeps it in September 20–26 and in September.')
      const removeAll = screen.getByRole('menuitem', { name: /^Remove day and week/ })
      expect(removeAll).toHaveTextContent('Keeps it in September, under anything it supports.')
    })

    it('confirms the removal that actually landed, once, with an Undo', async () => {
      state.tasks = [task({ id: 'a1', title: 'Buy tickets', monthStart: thisMonth,
        bucket: 'timed', scheduledFor: new Date(2026, 8, 22), isAllDay: true,
        commitments: [{ level: 'month', periodStart: thisMonth, status: 'open' },
          { level: 'week', periodStart: new Date(2026, 8, 20), status: 'open' }] })]
      renderPage('month')
      fireEvent.click(timingBtn('Buy tickets'))
      fireEvent.click(screen.getByRole('menuitem', { name: /^Remove Tue, Sep 22/ }))
      await vi.waitFor(() => expect(toastSpy).toHaveBeenCalled())
      expect(toastSpy).toHaveBeenCalledTimes(1)
      const [message, , , action] = toastSpy.mock.calls[0] as [string, string, number, { label: string }]
      expect(message).toContain('Removed Tue, Sep 22 from \u201cBuy tickets\u201d.')
      expect(message).toContain('Keeps it in September 20–26 and in September.')
      expect(action.label).toBe('Undo')
      // The day goes; the week and the month are not in the write at all.
      const [, updates] = hook.updateTask.mock.calls.at(-1) as [string, Record<string, unknown>]
      expect(updates.scheduledFor).toBeUndefined()
      expect('weekStart' in updates).toBe(false)
      expect('monthStart' in updates).toBe(false)
    })

    it('offers View week for a committed week, and View day for a day', () => {
      state.tasks = [
        task({ id: 'a1', title: 'Weekly one', monthStart: thisMonth,
          commitments: [{ level: 'month', periodStart: thisMonth, status: 'open' },
            { level: 'week', periodStart: new Date(2026, 8, 20), status: 'open' }] }),
        task({ id: 'a2', title: 'Dated one', monthStart: thisMonth,
          bucket: 'timed', scheduledFor: new Date(2026, 8, 22), isAllDay: true,
          commitments: [{ level: 'month', periodStart: thisMonth, status: 'open' }] }),
      ]
      renderPage('month')
      const list = screen.getByRole('region', { name: / list$/ })
      fireEvent.click(within(list).getByRole('button', { name: 'View week →' }))
      expect(mockNavigate).toHaveBeenCalledWith('/week?start=2026-09-20')
      fireEvent.click(within(list).getByRole('button', { name: 'View day →' }))
      expect(mockNavigate).toHaveBeenCalledWith('/today?date=2026-09-22')
    })

    it('offers no View link when nothing is chosen', () => {
      state.tasks = [task({ id: 'a1', title: 'Untimed one', monthStart: thisMonth })]
      renderPage('month')
      expect(screen.queryByRole('button', { name: /^View (week|day) →$/ })).toBeNull()
    })
  })

  it('Drop on a past month ends that month\'s commitment and never deletes the task', async () => {
    state.tasks = [task({ id: 'p1', title: 'Sort photos', monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    renderPageAt('month', `/month?start=${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`)
    fireEvent.click(await screen.findByRole('button', { name: /drop/i }))
    expect(hook.dropCommitment).toHaveBeenCalledWith('p1', 'month', expect.any(Date))
    expect(hook.deleteTask).not.toHaveBeenCalled()
  })
})

// planningPeriod wiring (fix round 1, review findings 2a-d): the URL param,
// the "looking ahead" line, the anchor-settle guard, and the fold's own
// look-ahead all need coverage beyond the pure periodPage.test.ts.
describe('PeriodPlanPage — planningPeriod wiring', () => {
  beforeEach(() => {
    pinClock()
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    localStorage.clear()
    Object.values(hook).forEach((f) => f.mockClear())
    Object.values(goalsApi).forEach((f) => f.mockClear())
    mockNavigate.mockClear()
    // PlanRail remembers fold-open state in localStorage keyed by level; an
    // earlier test's "folds the season…" click otherwise leaves this month's
    // fold open before this block even runs.
    localStorage.clear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('an explicit ?start= wins over the current period', () => {
    renderPageAt('season', '/season?start=2026-12-01')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/\d{4}$/)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Winter 2026')
  })

  it('opens on the coming season and shows the "looking ahead" line when the current one is nearly over', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20)) // Nov 20 — 11 days left in Fall
    renderPage('season')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Winter 2026')
    expect(screen.getByText(/Winter 2026 starts in 11 days/)).toBeInTheDocument()
    expect(screen.getByText(/looking ahead/)).toBeInTheDocument()
  })

  it('does not snap back to the looked-ahead period after the user has navigated, even once tasks finish loading', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20)) // Nov 20 — would look ahead to Winter once tasks load
    state.loading = true // tasks haven't loaded yet — the initial computation is deferred
    const { rerender } = renderPage('season')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Fall 2026')
    fireEvent.click(screen.getByLabelText('Previous season'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Summer 2026')
    // Tasks finish loading — re-rendering the SAME instance must not let the
    // guarded effect override where the user navigated to.
    state.loading = false
    rerender(<MemoryRouter><PeriodPlanPage level="season" /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Summer 2026')
  })

  // A stale localStorage-cached season boundary must not get baked into the
  // settled anchor before the household's real seasons arrive (demo run
  // 2026-09-06: the effect settled on Summer under an old Oct-1 Fall
  // boundary, then the household row loaded with Fall moved to Sep 1, and
  // the masthead stayed stuck on Summer even though Sep 6 is Fall).
  it('waits for the household seasons to finish loading before settling the initial period', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 6)) // Sep 6, 2026
    const staleSeasons: Seasons = [
      { name: 'Spring', month: 3, day: 1 },
      { name: 'Summer', month: 6, day: 1 },
      { name: 'Fall', month: 10, day: 1 }, // stale cache: Fall used to start Oct 1
      { name: 'Winter', month: 12, day: 1 },
    ]
    seasonsState.seasons = staleSeasons
    seasonsState.loading = true // household row hasn't loaded yet
    const { rerender } = renderPage('season')
    // The real boundaries arrive — Fall now starts Sep 1, so Sep 6 is Fall.
    seasonsState.seasons = DEFAULT_SEASONS
    seasonsState.loading = false
    rerender(<MemoryRouter><PeriodPlanPage level="season" /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Fall 2026')
    expect(screen.queryByText('Summer 2026')).not.toBeInTheDocument()
  })

  it('a looked-ahead season fold excludes a legacy NULL-seasonStart row — the fold is not "current" just because it opened ahead', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20)) // Nov 20 — season fold looks ahead to Winter
    state.tasks = [task({ title: 'Legacy quarter row', bucket: 'quarter' })] // no seasonStart
    renderPage('month')
    const rail = screen.getByRole('complementary', { name: 'This Season' })
    fireEvent.click(within(rail).getByRole('button', { name: /This Season/ }))
    expect(within(rail).queryByText('Legacy quarter row')).not.toBeInTheDocument()
  })
})

describe('PeriodPlanPage masthead', () => {
  beforeEach(pinClock)
  afterEach(() => { vi.useRealTimers() })

  it('wears the shared masthead card with the period AS the title and the nav in the eyebrow', () => {
    renderPage('month')
    const card = screen.getByTestId('masthead-card')
    // The PERIOD is the page's name; "month" is the nav's subject in the eyebrow.
    const monthName = now.toLocaleDateString('en-US', { month: 'long' })
    expect(within(card).getByRole('heading', { level: 1 }).textContent).toContain(monthName)
    const eyebrow = screen.getByTestId('masthead-eyebrow')
    expect(within(eyebrow).getByLabelText('Previous month')).toBeInTheDocument()
    expect(within(eyebrow).getByLabelText('Next month')).toBeInTheDocument()
    // Same column as Inbox and Discussions, so the cards line up page to page.
    expect(card.parentElement?.className).toMatch(/max-w-\[1152px\]/)
  })
})

// "Transform the porch" is a September goal; "hang plants" and "buy new chairs"
// are the work it takes. The goal holds them, and they leave the loose list.
describe('steps under a goal', () => {
  afterEach(() => { vi.useRealTimers() })
  beforeEach(() => {
    pinClock()
    // Which goals are open now PERSISTS per period, so one case's expansion
    // would otherwise arrive pre-opened in the next (long lists, 2026-09-24).
    localStorage.clear()
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    vi.clearAllMocks()
  })

  const porchPlan = () => {
    state.tasks = [
      task({ id: 'g1', title: 'Transform the porch', isGoal: true, monthStart: thisMonth }),
      task({ id: 's1', title: 'Hang plants', goalTaskId: 'g1', monthStart: thisMonth }),
      task({ id: 'l1', title: 'Renew car registration', monthStart: thisMonth }),
    ]
  }

  it('draws a step under its goal and not in the task list', () => {
    porchPlan()
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Show steps under Transform the porch/i }))
    const goals = screen.getByRole('region', { name: /goals$/ })
    expect(within(goals).getByText('Hang plants')).toBeInTheDocument()
    const list = screen.getByRole('region', { name: /list$/ })
    expect(within(list).queryByText('Hang plants')).not.toBeInTheDocument()
    expect(within(list).getByText('Renew car registration')).toBeInTheDocument()
  })

  it('keeps the step hidden until the goal is opened', () => {
    porchPlan()
    renderPage('month')
    expect(screen.queryByText('Hang plants')).not.toBeInTheDocument()
  })

  it('adding a step writes the goal it serves', () => {
    porchPlan()
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Show steps under Transform the porch/i }))
    const input = screen.getByLabelText(/New step for Transform the porch/i)
    fireEvent.change(input, { target: { value: 'Buy new chairs' } })
    fireEvent.submit(input)
    expect(hook.addTask).toHaveBeenCalledWith('Buy new chairs', undefined, undefined, undefined,
      expect.objectContaining({ bucket: 'month', goalTaskId: 'g1' }))
  })

  it('files a loose row under a goal you pick', () => {
    porchPlan()
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Link Renew car registration to a goal/i }))
    const picker = screen.getByRole('dialog', { name: /Link to goal/i })
    fireEvent.click(within(picker).getByRole('button', { name: /Transform the porch/i }))
    expect(hook.updateTask).toHaveBeenCalledWith('l1', { goalTaskId: 'g1' })
  })

  it('retains the goal picker and allows retry after a failed link', async () => {
    porchPlan()
    hook.updateTask.mockResolvedValueOnce(false)
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Link Renew car registration to a goal/i }))
    const picker = screen.getByRole('dialog', { name: /Link to goal/i })
    fireEvent.click(within(picker).getByRole('button', { name: /Transform the porch/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not link this task')
    expect(picker).toBeInTheDocument()
    fireEvent.click(within(picker).getByRole('button', { name: /Transform the porch/i }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Link to goal/i })).toBeNull())
  })

  it('offers no "under a goal" verb when the period has no goals', () => {
    state.tasks = [task({ id: 'l1', title: 'Renew car registration', monthStart: thisMonth })]
    renderPage('month')
    expect(screen.queryByRole('button', { name: /Link to goal/i })).not.toBeInTheDocument()
  })

  it('the season page holds steps the same way', () => {
    state.tasks = [
      task({ id: 'g2', title: 'Make the house ours', isGoal: true, bucket: 'quarter' }),
      task({ id: 's2', title: 'Clear the garage', goalTaskId: 'g2', bucket: 'quarter' }),
    ]
    renderPage('season')
    fireEvent.click(screen.getByRole('button', { name: /Show steps under Make the house ours/i }))
    expect(screen.getByText('Clear the garage')).toBeInTheDocument()
  })
})

// Guided planning, Phase 1: the month planning session hosted on /month.
// The clock is pinned mid-October so "this month" and "last month" never
// straddle a boundary (planningPeriod looks ahead near a month's end).
describe('PeriodPlanPage — Plan <Month>', () => {
  let thisMonth: Date
  let lastMonth: Date
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 10, 10))           // Sat Oct 10 2026
    const d = new Date()
    thisMonth = new Date(d.getFullYear(), d.getMonth(), 1)
    lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    localStorage.clear()
    Object.values(hook).forEach((f) => f.mockClear())
    hook.addTask.mockImplementation(defaultAddTask)
    hook.updateTask.mockImplementation(async () => true)
    hook.keepForward.mockImplementation(async (id: string) => id)
    hook.dropCommitment.mockImplementation(async () => true)
    hook.completeTask.mockImplementation(async () => true)
    mockNavigate.mockClear()
    Object.values(goalsApi).forEach((f) => f.mockClear())
    goalsApi.addGoal.mockImplementation(async (_a: string, name: string) => goal({ name }))
    sessionState.saved = null; sessionState.mine = null; sessionState.loadedToken = 'auto'; sessionState.error = null; sessionState.loading = false
    saveSession.mockClear(); reloadSession.mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('offers "Plan <Month>" on the current month, and "Planned <date>" once saved', () => {
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    expect(screen.getByRole('button', { name: `Plan ${label}` })).toBeInTheDocument()
  })

  it('shows the planned state when a household member saved this month', () => {
    sessionState.saved = { at: new Date(2026, 8, 29), authorId: 'u2', notes: {} }
    renderPage('month')
    expect(screen.getByText(/planned sep 29/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review the plan/i })).toBeInTheDocument()
  })

  it('an empty, unplanned month invites the session from its empty list, and opens it', () => {
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    const list = screen.getByRole('region', { name: /list$/ })
    const button = within(list).getByRole('button', { name: /^Plan .* →$/ })
    expect(button).toHaveAccessibleName(`Plan ${label} →`)
    fireEvent.click(button)
    expect(screen.getByLabelText('Planning steps')).toBeInTheDocument()
  })

  it('an empty but already-planned month stays plain — no button', () => {
    sessionState.saved = { at: new Date(2026, 8, 29), authorId: 'u2', notes: {} }
    renderPage('month')
    const list = screen.getByRole('region', { name: /list$/ })
    expect(within(list).queryByRole('button', { name: /^Plan .* →$/ })).toBeNull()
    expect(within(list).getByText(`Nothing on this month's list yet.`)).toBeInTheDocument()
  })

  it('a past month\'s empty list never offers a session button', () => {
    renderPageAt('month', `/month?start=${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`)
    expect(screen.queryByRole('button', { name: /^Plan .* →$/ })).toBeNull()
  })

  it('runs a session end to end: keep a goal with a next action, save, return to the page with the week line', async () => {
    state.tasks = [task({ id: 'g1', title: 'Strength', isGoal: true, monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep, and add a next action' }))
    fireEvent.change(screen.getByLabelText(/next action for strength/i), { target: { value: 'Book PT' } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`next: plan ${label}`, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.keepForward).toHaveBeenCalledWith('g1', { monthStart: expect.any(Date) }, expect.any(Date))
    expect((hook.keepForward.mock.calls[0][2] as Date).getMonth()).toBe(lastMonth.getMonth())   // carried FROM last month
    expect(hook.addTask).toHaveBeenCalledWith('Book PT', undefined, undefined, undefined, expect.objectContaining({ bucket: 'month', goalTaskId: 'g1' }))
    expect(await screen.findByRole('link', { name: /plan the week/i })).toBeInTheDocument()
  })

  it('a kept goal with a blank next action cannot move on — its row asks for one', () => {
    state.tasks = [task({ id: 'g1', title: 'Strength', isGoal: true, monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep, and add a next action' }))
    fireEvent.change(screen.getByLabelText(/next action for strength/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`next: plan ${label}`, 'i') }))
    // Still on the look-back, with the reason on the goal's own row.
    expect(screen.getByText(/name the next action, or choose keep/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next: save/i })).toBeNull()
    // Naming it lets the plan continue.
    fireEvent.change(screen.getByLabelText(/next action for strength/i), { target: { value: 'Book PT' } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`next: plan ${label}`, 'i') }))
    expect(screen.getByRole('button', { name: /next: save/i })).toBeInTheDocument()
  })

  it('a failed save keeps the unsaved items as the draft, stays open, and does not say planned', async () => {
    state.tasks = [task({ id: 'p1', title: 'Photos', monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    hook.dropCommitment.mockResolvedValueOnce(false)
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`next: plan ${label}`, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't save/i)
    expect(saveSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /plan the week/i })).toBeNull()
    const stored = Object.keys(localStorage).find((k) => k.startsWith('symphony.planSession.u1.month.'))
    expect(JSON.parse(localStorage.getItem(stored!)!).verdicts).toEqual({ p1: 'drop' })
  })

  it('"Review the plan" reopens with my saved notes, so a re-save never blanks them', () => {
    sessionState.saved = { at: new Date(2026, 8, 29), authorId: 'u1', notes: { wentWell: 'bike rack', didnt: 'strength slipped' } }
    sessionState.mine = { wentWell: 'bike rack', didnt: 'strength slipped' }
    state.tasks = [task({ id: 'o1', title: 'Old', monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /review the plan/i }))
    expect(screen.getByLabelText(/what went well/i)).toHaveValue('bike rack')
    expect(screen.getByLabelText(/what didn't/i)).toHaveValue('strength slipped')
  })

  it('planning NEXT month from this one writes the season pull into next month, not today\'s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 20, 10))   // Sun Sep 20 2026
    try {
    const seasonStart = periodStartFor('season', new Date(), DEFAULT_SEASONS)
    state.tasks = [task({ id: 'b1', title: 'Get three bids', bucket: 'quarter', seasonStart, commitments: [{ level: 'season', periodStart: seasonStart, status: 'open' }] })]
    renderPageAt('month', '/month?start=2026-10-01')                                     // explicitly October
    const label = 'October'
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`add to ${label}: get three bids`, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.change(screen.getByLabelText('Domain for Get three bids'), { target: { value: 'family' } })
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await vi.waitFor(() => expect(hook.updateTask).toHaveBeenCalledWith('b1', expect.objectContaining({ bucket: 'month', monthStart: expect.any(Date) })))
    const monthStart = (hook.updateTask.mock.calls.find((c) => c[0] === 'b1')![1] as { monthStart: Date }).monthStart
    expect(monthStart.getMonth()).toBe(9)                                                 // October, while "today" is September
    expect(hook.pushTask).not.toHaveBeenCalledWith('b1', 'month')
    } finally { vi.useRealTimers() }
  })

  it('a failed read keeps planning closed and offers Try again', () => {
    sessionState.loadedToken = null
    sessionState.error = 'offline'
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    expect(screen.getByRole('button', { name: `Plan ${label}` })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reloadSession).toHaveBeenCalled()
  })

  it('cannot open a session until THIS month\'s saved record has loaded', () => {
    sessionState.loadedToken = null
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    expect(screen.getByRole('button', { name: `Plan ${label}` })).toBeDisabled()
  })

  it('a reload mid-save resumes from the persisted progress without re-creating what landed', async () => {
    // First save: the goal lands, then the task create fails (as if the page died there).
    hook.addTask.mockImplementation(async (_t?: unknown, _a?: unknown, _b?: unknown, _c?: unknown, o?: unknown) => {
      const opts = o as { id: string; isGoal?: boolean } | undefined
      return opts?.isGoal ? opts.id : undefined
    })
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.change(screen.getByLabelText(new RegExp(`new goal for ${label}`, 'i')), { target: { value: 'Three bids' } })
    fireEvent.click(screen.getByRole('button', { name: /add goal/i }))
    fireEvent.change(screen.getByLabelText(new RegExp(`new task for ${label}`, 'i')), { target: { value: 'Call Hughes' } })
    fireEvent.change(screen.getByLabelText(new RegExp(`toward a ${label} goal`, 'i')), { target: { value: screen.getByRole('option', { name: 'Three bids' }).getAttribute('value')! } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await screen.findByRole('alert')
    const key = Object.keys(localStorage).find((k) => k.startsWith('symphony.planSession.u1.month.'))!
    const persisted = JSON.parse(localStorage.getItem(key)!)
    expect(persisted.newGoals).toEqual([])                       // the goal is recorded as written
    expect(persisted.created).toHaveLength(1)
    expect(persisted.newTasks[0].linkId).toBe(persisted.created[0])
    const goalCreates = hook.addTask.mock.calls.filter((c) => (c[4] as { isGoal?: boolean })?.isGoal).length
    // "Reload": remount, reopen, save again — only the task is attempted.
    cleanup()
    hook.addTask.mockImplementation(async (_t?: unknown, _a?: unknown, _b?: unknown, _c?: unknown, o?: unknown) => (o as { id: string } | undefined)?.id)
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Continue planning ${label}` }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${label}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.addTask.mock.calls.filter((c) => (c[4] as { isGoal?: boolean })?.isGoal).length).toBe(goalCreates)
  })

  it('Close keeps the draft and the button then says Continue', () => {
    // Something to look back at, so the session opens on the look-back step
    // (with nothing behind it, it opens straight on Plan).
    state.tasks = [task({ id: 'o1', title: 'Old', monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }] })]
    renderPage('month')
    const label = thisMonth.toLocaleDateString('en-US', { month: 'long' })
    fireEvent.click(screen.getByRole('button', { name: `Plan ${label}` }))
    fireEvent.change(screen.getByLabelText(/what went well/i), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /close · keep my draft/i }))
    expect(screen.getByRole('button', { name: `Continue planning ${label}` })).toBeInTheDocument()
  })

  it('an empty year offers direct goal entry and one planning action', () => {
    vi.setSystemTime(new Date(2026, 11, 20))
    renderPageAt('year', '/year?start=2027-01-01')
    expect(screen.getByRole('textbox', { name: 'New goal for 2027' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plan 2027' })).toBeInTheDocument()
  })

  it('the season page and the year page each carry a planning bar', () => {
    const view = renderPage('season')
    expect(screen.getByRole('button', { name: 'Plan Fall 2026' })).toBeInTheDocument()
    expect(screen.getByText(/^0 goals/)).toBeInTheDocument()
    view.unmount()
    renderPage('year')
    expect(screen.getByRole('button', { name: 'Plan 2026' })).toBeInTheDocument()
    expect(screen.getByText(/^0 goals/)).toBeInTheDocument()
  })

  it('the season page plans the season: look back at the previous season, keep into this one, add a task toward a season goal, save once', async () => {
    // Previous season = Summer 2026 (Jun 1, DEFAULT_SEASONS); this season =
    // Fall 2026, starting Sep 1. The suite's clock is Sat Oct 10 2026.
    const summer = new Date(2026, 5, 1)
    const fall = new Date(2026, 8, 1)
    const prevOpen = task({ id: 'p', title: 'Bike rack', bucket: 'quarter', seasonStart: summer,
      commitments: [{ level: 'season', periodStart: summer, status: 'open' }] })
    state.tasks = [prevOpen]
    state.goals = [
      goal({ id: 'yg', name: 'Get strong again' }),
      // Dropped at the year: archived, not deleted — and so no longer beside the season.
      goal({ id: 'yd', name: 'Learn the cello', status: 'archived' }),
    ]
    renderPage('season')
    fireEvent.click(await screen.findByRole('button', { name: /^Plan Fall 2026$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: /next: plan fall 2026/i }))
    // The year's goals sit beside the season's plan (and can be written toward).
    expect(screen.getAllByText('Get strong again').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('complementary')).getByText('Get strong again')).toBeInTheDocument()
    // A year goal that was Dropped is archived, not deleted — and it must not
    // keep standing beside the season for ever (fix round 1).
    expect(within(screen.getByRole('complementary')).queryByText('Learn the cello')).toBeNull()
    expect(screen.queryByText('Learn the cello')).toBeNull()
    fireEvent.change(screen.getByLabelText(/new task for fall 2026/i), { target: { value: 'Book a PT evaluation' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: /save fall 2026/i }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalledTimes(1))
    expect(hook.keepForward).toHaveBeenCalledWith('p', { seasonStart: fall }, summer)
    expect(hook.addTask).toHaveBeenCalledWith('Book a PT evaluation', undefined, undefined, undefined,
      expect.objectContaining({ bucket: 'quarter', seasonStart: fall }))
    expect(screen.getByRole('link', { name: /plan the month/i })).toBeInTheDocument()
    // A season takes nothing down from the year: the rail never offers a row.
    expect(screen.queryByRole('button', { name: /^Add to Fall 2026/ })).toBeNull()
  })

  it("the year page plans the year from last year's goals: Keep copies notes, strategy, area, context and links the goal; Done and Drop change status; nothing is deleted", async () => {
    vi.setSystemTime(new Date(2026, 11, 20))
    state.goals = [
      goal({ id: 'k', name: 'Get strong again', year: 2026, areaId: 'a1', notes: 'PT twice a week', strategy: 'Coach', context: 'personal' }),
      goal({ id: 'dn', name: 'Kitchen', year: 2026 }),
      goal({ id: 'dr', name: 'Old', year: 2026 }),
      goal({ id: 'fin', name: 'Bike', year: 2026, status: 'completed' }),
    ]
    renderPageAt('year', '/year?start=2027-01-01')
    fireEvent.click(await screen.findByRole('button', { name: /^Plan 2027$/ }))
    expect(screen.getByText('Bike')).toBeInTheDocument()                                    // finished
    const rows = screen.getAllByRole('listitem').filter((li) => within(li).queryByRole('button', { name: 'Keep' }))
    fireEvent.click(within(rows.find((li) => li.textContent?.includes('Get strong again'))!).getByRole('button', { name: 'Keep' }))
    fireEvent.click(within(rows.find((li) => li.textContent?.includes('Kitchen'))!).getByRole('button', { name: 'Done' }))
    fireEvent.click(within(rows.find((li) => li.textContent?.includes('Old'))!).getByRole('button', { name: 'Drop' }))
    fireEvent.click(screen.getByRole('button', { name: /next: plan 2027/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: /save 2027/i }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalledTimes(1))
    expect(goalsApi.addGoal).toHaveBeenCalledWith('a1', 'Get strong again', 'personal', expect.objectContaining({
      year: 2027, notes: 'PT twice a week', strategy: 'Coach', carriedFrom: 'k', id: expect.any(String),
    }))
    expect(goalsApi.updateGoal).toHaveBeenCalledWith('dn', { status: 'completed' })
    expect(goalsApi.updateGoal).toHaveBeenCalledWith('dr', { status: 'archived' })
    expect(goalsApi.deleteGoal).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /plan the season/i })).toBeInTheDocument()
  })

  it("a season starting in January anchors its year rail on the season's own year, not the current one (carried fix)", () => {
    // A household whose seasons cross the new year — Spring starts Jan 1 —
    // needs the season page's "bigger picture" rail to show THAT year's
    // goals, not the year `planningPeriod` would otherwise land on.
    seasonsState.seasons = [
      { name: 'Spring', month: 1, day: 1 },
      { name: 'Summer', month: 4, day: 1 },
      { name: 'Fall', month: 7, day: 1 },
      { name: 'Winter', month: 10, day: 1 },
    ] as Seasons
    state.goals = [goal({ id: 'g27', name: 'Run a marathon', year: 2027 })]
    renderPageAt('season', '/season?start=2027-01-01')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Spring 2027')
    expect(screen.getByText('2027')).toBeInTheDocument()               // the rail's subtitle: the year
    fireEvent.click(screen.getByRole('button', { name: /this year/i }))
    expect(screen.getByText('Run a marathon')).toBeInTheDocument()
  })

  it("the DEFAULT year page looks back at last year — the goals context holds every year (regression)", async () => {
    // No ?start=: the page plans 2026 (the suite's clock) and looks back at
    // 2025. Both years are in the context, as the unfiltered fetch now gives.
    state.goals = [
      goal({ id: 'g25', name: 'Learn to sail', year: 2025 }),
      goal({ id: 'g26', name: 'Get strong again', year: 2026 }),
    ]
    renderPage('year')
    fireEvent.click(await screen.findByRole('button', { name: /^Plan 2026$/ }))
    expect(screen.getByText(/Look back at 2025/)).toBeInTheDocument()
    expect(screen.queryByText(/nothing to look back at/i)).toBeNull()
    const rows = screen.getAllByRole('listitem').filter((li) => within(li).queryByRole('button', { name: 'Keep' }))
    expect(rows.some((li) => li.textContent?.includes('Learn to sail'))).toBe(true)
  })

  it('a Keep with no id in the draft is given one BEFORE the save, and a retry re-uses it', async () => {
    vi.setSystemTime(new Date(2026, 11, 20))
    state.goals = [goal({ id: 'k', name: 'Get strong again', year: 2026 })]
    goalsApi.addGoal.mockImplementationOnce(async () => null)          // first Save half-fails
    renderPageAt('year', '/year?start=2027-01-01')
    fireEvent.click(await screen.findByRole('button', { name: /^Plan 2027$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: /next: plan 2027/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: /save 2027/i }))
    await vi.waitFor(() => expect(goalsApi.addGoal).toHaveBeenCalledTimes(1))
    const firstId = (goalsApi.addGoal.mock.calls[0][3] as { id: string }).id
    expect(firstId).toEqual(expect.any(String))

    // Save again once the failed attempt has settled: the SAME id, so the
    // retry lands on one row, not two.
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /save 2027/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /save 2027/i }))
    await vi.waitFor(() => expect(goalsApi.addGoal).toHaveBeenCalledTimes(2))
    expect((goalsApi.addGoal.mock.calls[1][3] as { id: string }).id).toBe(firstId)
  })

  it('the year look-back is skipped when last year has no goals', async () => {
    vi.setSystemTime(new Date(2026, 11, 20))
    state.goals = []
    renderPageAt('year', '/year?start=2027-01-01')
    fireEvent.click(await screen.findByRole('button', { name: /^Plan 2027$/ }))
    expect(screen.getByText(/nothing to look back at/i)).toBeInTheDocument()
  })

  it("the year page's Drop verb archives, never deletes", async () => {
    state.goals = [goal({ id: 'y1', name: 'Run a half marathon', year: 2026 })]
    renderPage('year')
    fireEvent.click(await screen.findByRole('button', { name: 'Drop Run a half marathon' }))
    expect(goalsApi.updateGoal).toHaveBeenCalledWith('y1', { status: 'archived' })
    expect(goalsApi.deleteGoal).not.toHaveBeenCalled()
  })

  // ── Final review fixes ─────────────────────────────────────────────────────
  const openOn = (id: string, over: Partial<Task> = {}) =>
    task({ id, monthStart: lastMonth, commitments: [{ level: 'month', periodStart: lastMonth, status: 'open' }], ...over })
  const monthLabel = () => thisMonth.toLocaleDateString('en-US', { month: 'long' })
  const toSave = () => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`next: plan ${monthLabel()}`, 'i') }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
  }
  const draftKey = (start: Date) => `symphony.planSession.u1.month.${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`

  it('a stored verdict for a task that is gone is neither shown nor written, and Save completes (I2)', async () => {
    state.tasks = [openOn('p1', { title: 'Photos' })]
    localStorage.setItem(draftKey(thisMonth), JSON.stringify({
      level: 'month', periodStart: draftKey(thisMonth).slice(-10), prevStart: draftKey(lastMonth).slice(-10),
      verdicts: { p1: 'drop', deleted: 'keep' }, actionTitles: {}, actionIds: {}, keptAlready: [], created: [],
      wentWell: '', didnt: '', newGoals: [], newTasks: [], takenFromAbove: ['gone-from-season'],
    }))
    hook.keepForward.mockImplementation(async () => undefined)          // a deleted row can never be kept
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Continue planning ${monthLabel()}` }))
    toSave()
    expect(screen.getAllByText(/→/)).toHaveLength(1)                      // only Photos
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${monthLabel()}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.keepForward).not.toHaveBeenCalled()
    expect(hook.updateTask).not.toHaveBeenCalledWith('gone-from-season', expect.anything())
    expect(hook.dropCommitment).toHaveBeenCalledWith('p1', 'month', expect.any(Date))
  })

  it('a new item keeps the domain it was planned in, even when Save happens in another view (I4)', async () => {
    domainState.soleDomain = 'work'
    const view = renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${monthLabel()}` }))
    fireEvent.change(screen.getByLabelText(new RegExp(`new task for ${monthLabel()}`, 'i')), { target: { value: 'Expense report' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    domainState.soleDomain = 'family'                                     // switch the view, then save
    view.rerender(<MemoryRouter><PeriodPlanPage level="month" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${monthLabel()}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.addTask).toHaveBeenCalledWith('Expense report', undefined, undefined, undefined, expect.objectContaining({ context: 'work' }))
  })

  it('a next action takes its goal\'s domain, whatever is in view (I4)', async () => {
    state.tasks = [openOn('g1', { title: 'Strength', isGoal: true, context: 'family' })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${monthLabel()}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep, and add a next action' }))
    fireEvent.change(screen.getByLabelText(/next action for strength/i), { target: { value: 'Book PT' } })
    toSave()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${monthLabel()}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.addTask).toHaveBeenCalledWith('Book PT', undefined, undefined, undefined, expect.objectContaining({ context: 'family', goalTaskId: 'g1' }))
  })

  it('a task toward a goal takes the goal\'s domain (I4)', async () => {
    state.tasks = [task({ id: 'cur', title: 'Porch', isGoal: true, context: 'family', monthStart: thisMonth, commitments: [{ level: 'month', periodStart: thisMonth, status: 'open' }] })]
    domainState.soleDomain = 'work'
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${monthLabel()}` }))
    fireEvent.change(screen.getByLabelText(new RegExp(`new task for ${monthLabel()}`, 'i')), { target: { value: 'Buy chairs' } })
    fireEvent.change(screen.getByLabelText(new RegExp(`toward a ${monthLabel()} goal`, 'i')), { target: { value: 'cur' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${monthLabel()}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.addTask).toHaveBeenCalledWith('Buy chairs', undefined, undefined, undefined, expect.objectContaining({ context: 'family', goalTaskId: 'cur' }))
  })

  it('the look-back leaves out a row assigned only to the partner (I5)', () => {
    state.tasks = [openOn('m1', { title: 'Mine' }), openOn('p1', { title: 'Theirs', assignedTo: 'partner' })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${monthLabel()}` }))
    expect(screen.getByText('Mine')).toBeInTheDocument()
    expect(screen.queryByText('Theirs')).toBeNull()
  })

  it('Done completes the task the way a tick does (I7)', async () => {
    state.tasks = [openOn('t1', { title: 'Library card' })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${monthLabel()}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    toSave()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${monthLabel()}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.completeTask).toHaveBeenCalledWith('t1')
    expect(hook.updateTask).not.toHaveBeenCalledWith('t1', expect.objectContaining({ completed: true }))
  })

  it('switching month while a save is running does not carry that save onto the new month (M2)', async () => {
    state.tasks = [openOn('p1', { title: 'Photos' })]
    let finish: (v: boolean) => void = () => {}
    hook.dropCommitment.mockImplementation(() => new Promise<boolean>((r) => { finish = r }))
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${monthLabel()}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Drop' }))
    toSave()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${monthLabel()}`, 'i') }))
    expect(screen.getByRole('button', { name: /close · keep my draft/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    const next = new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 1)
    const nextLabel = next.toLocaleDateString('en-US', { month: 'long' })
    await vi.waitFor(() => expect(screen.getByRole('button', { name: `Plan ${nextLabel}` })).toBeInTheDocument())
    finish(false)                                                           // the save fails, AFTER the switch
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(draftKey(thisMonth))!).verdicts).toEqual({ p1: 'drop' }))
    expect(localStorage.getItem(draftKey(next))).toBeNull()
    expect(screen.getByRole('button', { name: `Plan ${nextLabel}` })).toBeInTheDocument()   // not "Continue planning"
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('link', { name: /plan the week/i })).toBeNull()
  })

  it('the blocked-Next message is announced and marks its input invalid (M9)', () => {
    state.tasks = [openOn('g1', { title: 'Strength', isGoal: true })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${monthLabel()}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep, and add a next action' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`next: plan ${monthLabel()}`, 'i') }))
    expect(screen.getByRole('alert')).toHaveTextContent(/name the next action, or choose keep/i)
    expect(screen.getByLabelText(/next action for strength/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('the Plan button is busy only while loading, not after a failed read (M9)', () => {
    sessionState.loadedToken = null; sessionState.loading = true
    const view = renderPage('month')
    expect(screen.getByRole('button', { name: `Plan ${monthLabel()}` })).toHaveAttribute('aria-busy', 'true')
    view.unmount()
    sessionState.loading = false; sessionState.error = 'offline'
    renderPage('month')
    expect(screen.getByRole('button', { name: `Plan ${monthLabel()}` })).not.toHaveAttribute('aria-busy', 'true')
  })

  it('a Keep that carried the goal but not a step is retried by Save again, with its next action (N1)', async () => {
    const g1 = openOn('g1', { title: 'Strength', isGoal: true })
    const s1 = openOn('s1', { title: 'Book gym', goalTaskId: 'g1' })
    state.tasks = [g1, s1]
    // The goal's carry lands (Sep carried, Oct open); the step's fails → keepForward reports failure.
    hook.keepForward.mockImplementationOnce(async () => {
      state.tasks = [{ ...g1, monthStart: thisMonth, commitments: [
        { level: 'month', periodStart: lastMonth, status: 'carried', carriedTo: thisMonth },
        { level: 'month', periodStart: thisMonth, status: 'open' }] } as Task, s1]
      return undefined
    })
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${monthLabel()}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep, and add a next action' }))
    fireEvent.change(screen.getByLabelText(/next action for strength/i), { target: { value: 'Book PT' } })
    toSave()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${monthLabel()}`, 'i') }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't save/i)
    expect(hook.addTask).not.toHaveBeenCalled()
    // Still shown, still to be written.
    expect(screen.getByText('Book PT')).toBeInTheDocument()
    expect(screen.getByText(/carried with Strength/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`save ${monthLabel()}`, 'i') }))
    await vi.waitFor(() => expect(saveSession).toHaveBeenCalled())
    expect(hook.keepForward).toHaveBeenCalledTimes(2)
    expect(hook.keepForward.mock.calls[1][0]).toBe('g1')
    expect(hook.addTask).toHaveBeenCalledWith('Book PT', undefined, undefined, undefined, expect.objectContaining({ goalTaskId: 'g1' }))
  })

  it('a kept goal with steps this view hides says it carries them too (no count)', () => {
    state.tasks = [openOn('g1', { title: 'Strength', isGoal: true }), openOn('s2', { title: 'Partner step', goalTaskId: 'g1', assignedTo: 'partner' })]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${monthLabel()}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    toSave()
    expect(screen.getByText('Strength also carries steps not shown in this view')).toBeInTheDocument()
    expect(screen.queryByText('Partner step')).toBeNull()
  })
})


describe('the URL is the period (S2-16, Codex review of cefcdbcc)', () => {
  // goTo writes ?start=, but `anchor` only read it in its initial state, so
  // browser Back and Forward — which change the URL WITHOUT remounting — left
  // the heading and the list on the wrong month.
  it('opens on the month the URL names, not the month the clock is in', () => {
    renderPageAt('month', '/month?start=2026-11-01')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('November')
  })

  it('follows a ?start= change while the page stays mounted', () => {
    // This is the mechanism browser Back and Forward use: the search parameter
    // moves and the page does NOT remount. `anchor` only read the parameter in
    // its initial state, so October → November → Back left the heading on
    // November while the URL said October. (`useNavigate` is mocked in this
    // suite, so the history buttons themselves are verified in the browser.)
    function Param() {
      const [params, setParams] = useSearchParams()
      return (
        <>
          <span data-testid="url">{params.get('start')}</span>
          <button type="button" onClick={() => setParams({ start: '2026-11-01' })}>to november</button>
          <button type="button" onClick={() => setParams({ start: '2026-10-01' })}>to october</button>
        </>
      )
    }
    render(
      <MemoryRouter initialEntries={['/month?start=2026-10-01']}>
        <Param />
        <PeriodPlanPage level="month" />
      </MemoryRouter>,
    )
    const heading = () => screen.getByRole('heading', { level: 1 })
    expect(heading()).toHaveTextContent('October')

    fireEvent.click(screen.getByRole('button', { name: 'to november' }))
    expect(screen.getByTestId('url')).toHaveTextContent('2026-11-01')
    expect(heading()).toHaveTextContent('November')

    fireEvent.click(screen.getByRole('button', { name: 'to october' }))
    expect(screen.getByTestId('url')).toHaveTextContent('2026-10-01')
    expect(heading()).toHaveTextContent('October')
  })

  it('paging with the stepper puts the month in the URL', () => {
    renderPageAt('month', '/month?start=2026-10-01')
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('November')
  })
})

// ── Long lists ──────────────────────────────────────────────────────────────
// Scott approved the inline Month design and then asked for the part two
// sample goals cannot show. Synthetic fixtures only; nothing is seeded.
describe('a month with a realistic number of goals', () => {
  beforeEach(() => {
    pinClock()
    localStorage.clear()
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  /** 30 goals and 200 tasks, one goal carrying 60 steps. */
  const dense = () => {
    const rows: Task[] = []
    const big = task({ id: 'g-big', title: 'Record the album', isGoal: true, monthStart: thisMonth })
    rows.push(big)
    for (let i = 0; i < 60; i++) {
      rows.push(task({ id: `big-${i}`, title: `Album step ${i}`, goalTaskId: 'g-big', monthStart: thisMonth, completed: i % 4 === 0 }))
    }
    for (let g = 1; g < 30; g++) {
      rows.push(task({ id: `g${g}`, title: `Goal number ${g}`, isGoal: true, monthStart: thisMonth }))
      for (let i = 0; i < (g % 5); i++) {
        rows.push(task({ id: `g${g}-s${i}`, title: `Step ${i} of goal ${g}`, goalTaskId: `g${g}`, monthStart: thisMonth }))
      }
    }
    while (rows.length < 230) rows.push(task({ title: `Loose task ${rows.length}`, monthStart: thisMonth }))
    state.tasks = rows
  }

  it('draws every goal — no cap, nothing dropped', () => {
    dense()
    renderPage('month')
    expect(screen.getByText('Record the album')).toBeInTheDocument()
    expect(screen.getByText('Goal number 29')).toBeInTheDocument()
  })

  it('bounds a 60-step goal and offers the rest with the true total', async () => {
    dense()
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Show steps under Record the album/ }))
    expect(screen.getByText('Album step 1')).toBeInTheDocument()
    expect(screen.queryByText('Album step 30')).not.toBeInTheDocument()
    const more = screen.getByRole('button', { name: /^Show all 60 steps · \d+ more$/ })
    fireEvent.click(more)
    expect(screen.getByText('Album step 30')).toBeInTheDocument()
    // The goal's own bound is spent. (The loose-task list keeps its separate
    // "Show all 80 — 75 more", which is a different list's cap.)
    expect(screen.queryByRole('button', { name: /^Show all \d+ steps/ })).toBeNull()
  })

  it('a collapsed goal says how much is open and how much is done', () => {
    dense()
    renderPage('month')
    // 60 steps, every fourth completed.
    expect(screen.getByRole('button', { name: '45 open · 15 done · show' })).toBeInTheDocument()
  })

  it('filters to a step and keeps its goal with it, saying what is hidden', () => {
    dense()
    renderPage('month')
    fireEvent.change(screen.getByRole('searchbox', { name: /Filter .* goals and steps/ }), { target: { value: 'Album step 7' } })
    expect(screen.getByText('Record the album')).toBeInTheDocument()
    expect(screen.queryByText('Goal number 3')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/\d+ items are hidden by this filter/)
  })

  // The failure this must never allow: a filter that quietly narrows a write.
  it('a filter changes what is SHOWN and nothing else', () => {
    dense()
    renderPage('month')
    const search = screen.getByRole('searchbox', { name: /Filter .* goals and steps/ })
    fireEvent.change(search, { target: { value: 'Album step 7' } })
    expect(screen.getByRole('status')).toHaveTextContent(/Filtering does not change what will be saved/)
    // No write of any kind happened while filtering.
    expect(hook.updateTask).not.toHaveBeenCalled()
    expect(hook.updateTasksBulk).not.toHaveBeenCalled()
    expect(hook.deleteTask).not.toHaveBeenCalled()
    // Clearing it brings everything back — nothing was lost.
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByText('Goal number 3')).toBeInTheDocument()
  })

  it('completed steps fold away outside review, and come back on request', () => {
    dense()
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Show steps under Record the album/ }))
    // Album step 0 is completed; step 1 is not.
    expect(screen.getByText('Album step 1')).toBeInTheDocument()
    expect(screen.queryByText('Album step 0')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show completed steps' }))
    expect(screen.getByText('Album step 0')).toBeInTheDocument()
  })

  // Opening a step, reading it and coming back used to collapse everything.
  it('remembers which goals were open across a remount', () => {
    dense()
    const first = renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Show steps under Record the album/ }))
    expect(screen.getByText('Album step 1')).toBeInTheDocument()
    first.unmount()

    renderPage('month')
    expect(screen.getByText('Album step 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hide steps under Record the album/ })).toBeInTheDocument()
  })

  it('keeps "Add a step" reachable without opening the goal first', () => {
    dense()
    renderPage('month')
    const card = screen.getByText('Goal number 7').closest('li')!
    fireEvent.click(within(card).getByRole('button', { name: '+ Add a step' }))
    expect(screen.getByLabelText('New step for Goal number 7')).toBeInTheDocument()
  })
})

// A fold that is missing while work is hidden behind it is how work goes
// missing. Found live on a four-goal month, 2026-09-24.
describe('the completed-steps disclosure', () => {
  beforeEach(() => {
    pinClock(); localStorage.clear()
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  it('appears on a SHORT list as soon as a step is completed', () => {
    state.tasks = [
      task({ id: 'g', title: 'One goal', isGoal: true, monthStart: thisMonth }),
      task({ id: 's1', title: 'Open step', goalTaskId: 'g', monthStart: thisMonth }),
      task({ id: 's2', title: 'Finished step', goalTaskId: 'g', monthStart: thisMonth, completed: true }),
    ]
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Show steps under One goal/ }))
    expect(screen.queryByText('Finished step')).not.toBeInTheDocument()
    // …and the way to see it is right there, on a list of one goal.
    fireEvent.click(screen.getByRole('button', { name: 'Show completed steps' }))
    expect(screen.getByText('Finished step')).toBeInTheDocument()
  })

  it('stays away when there is nothing finished to disclose', () => {
    state.tasks = [
      task({ id: 'g', title: 'One goal', isGoal: true, monthStart: thisMonth }),
      task({ id: 's1', title: 'Open step', goalTaskId: 'g', monthStart: thisMonth }),
    ]
    renderPage('month')
    expect(screen.queryByRole('button', { name: /completed steps/i })).toBeNull()
  })
})

// ── The optional link up, and the goal's own status ─────────────────────────
// Codex, 2026-09-24: "existing month-to-season goal linking is a missing UI
// capability". Both write through fields that already exist; no migration.
describe('linking a goal to the rung above it', () => {
  const seasonStart = () => periodStartFor('season', new Date(), DEFAULT_SEASONS)
  beforeEach(() => {
    pinClock(); localStorage.clear()
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  const withSeasonGoals = (over: Partial<Task> = {}) => {
    state.tasks = [
      task({ id: 'sg1', title: 'A season of repairs', isGoal: true, bucket: 'quarter', seasonStart: seasonStart() }),
      task({ id: 'sg2', title: 'A season of music', isGoal: true, bucket: 'quarter', seasonStart: seasonStart() }),
      task({ id: 'mg1', title: 'A home easier to care for', isGoal: true, monthStart: thisMonth, ...over }),
      task({ id: 'st1', title: 'A step of its own', goalTaskId: 'mg1', monthStart: thisMonth }),
    ]
  }
  const openEditor = () => fireEvent.click(screen.getByRole('button', { name: /Link to a season goal|Change or remove this link/ }))
  const picker = () => screen.getByRole('combobox', { name: /Goal that A home easier to care for supports/ })

  it('offers the link on a goal that has none, and SETS it', () => {
    withSeasonGoals()
    renderPage('month')
    openEditor()
    fireEvent.change(picker(), { target: { value: 'sg1' } })
    // One field. The goal keeps its id, and nothing else is written.
    expect(hook.updateTask).toHaveBeenCalledWith('mg1', { supportsGoalTaskId: 'sg1' })
    expect(hook.updateTask).toHaveBeenCalledTimes(1)
  })

  it('CHANGES an existing link without touching anything else', () => {
    withSeasonGoals({ supportsGoalTaskId: 'sg1' })
    renderPage('month')
    openEditor()
    fireEvent.change(picker(), { target: { value: 'sg2' } })
    expect(hook.updateTask).toHaveBeenCalledWith('mg1', { supportsGoalTaskId: 'sg2' })
  })

  // Optional means removable.
  it('REMOVES the link when "No linked goal" is chosen', () => {
    withSeasonGoals({ supportsGoalTaskId: 'sg1' })
    renderPage('month')
    openEditor()
    fireEvent.change(picker(), { target: { value: '' } })
    expect(hook.updateTask).toHaveBeenCalledWith('mg1', { supportsGoalTaskId: undefined })
  })

  it('keeps the goal’s identity, steps and placement — it writes one field', () => {
    withSeasonGoals()
    renderPage('month')
    openEditor()
    fireEvent.change(picker(), { target: { value: 'sg1' } })
    const [, updates] = hook.updateTask.mock.calls[0] as [string, Record<string, unknown>]
    expect(Object.keys(updates)).toEqual(['supportsGoalTaskId'])
    for (const untouched of ['id', 'title', 'goalTaskId', 'bucket', 'monthStart', 'completed', 'scheduledFor']) {
      expect(untouched in updates).toBe(false)
    }
    expect(hook.addTask).not.toHaveBeenCalled()
    expect(hook.deleteTask).not.toHaveBeenCalled()
  })

  // The reciprocal read: the parent already lists what supports it.
  it('names the parent, and opens it, once the link is stored', () => {
    withSeasonGoals({ supportsGoalTaskId: 'sg1' })
    renderPage('month')
    const card = screen.getByRole('region', { name: /goals$/ })
    expect(within(card).getByText('Supports')).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Open A season of repairs' }))
    expect(mockNavigate).toHaveBeenCalledWith('/task/sg1')
  })

  it('offers no link control where there is nothing above to link to', () => {
    state.tasks = [task({ id: 'mg1', title: 'Lonely goal', isGoal: true, monthStart: thisMonth })]
    renderPage('month')
    expect(screen.queryByRole('button', { name: /Link to a season goal/ })).toBeNull()
  })

  // Archive is not in the app's vocabulary for a goal task, so it is not here.
  it('offers Active and Completed, and nothing it cannot honour', () => {
    withSeasonGoals()
    renderPage('month')
    const status = screen.getByRole('combobox', { name: /Status of A home easier to care for/ })
    expect([...status.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Active', 'Completed'])
  })

  it('a goal’s status is its own — set here, never read from its steps', () => {
    withSeasonGoals()
    renderPage('month')
    fireEvent.change(screen.getByRole('combobox', { name: /Status of A home easier to care for/ }), { target: { value: 'completed' } })
    expect(hook.updateTask).toHaveBeenCalledWith('mg1', { completed: true })
    const [, updates] = hook.updateTask.mock.calls[0] as [string, Record<string, unknown>]
    expect(Object.keys(updates)).toEqual(['completed'])
  })

  it('finishing every step does not complete the goal', () => {
    state.tasks = [
      task({ id: 'mg1', title: 'A home easier to care for', isGoal: true, monthStart: thisMonth }),
      task({ id: 's1', title: 'Only step', goalTaskId: 'mg1', monthStart: thisMonth, completed: true }),
    ]
    renderPage('month')
    const status = screen.getByRole('combobox', { name: /Status of A home easier to care for/ }) as HTMLSelectElement
    expect(status.value).toBe('active')
  })
})

// Codex review, 2026-09-24: counting only top-level goals missed the case that
// needs a filter most — one goal carrying sixty steps.
describe('the filter on ONE long goal', () => {
  beforeEach(() => {
    pinClock(); localStorage.clear()
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  const oneBigGoal = () => {
    state.tasks = [
      task({ id: 'g', title: 'Record the album', isGoal: true, monthStart: thisMonth }),
      ...Array.from({ length: 60 }, (_, i) =>
        task({ id: `s${i}`, title: `Album step ${i}`, goalTaskId: 'g', monthStart: thisMonth })),
    ]
  }

  it('offers a filter, on a list of exactly one goal', () => {
    oneBigGoal()
    renderPage('month')
    expect(screen.getByRole('searchbox', { name: /Filter .* goals and steps/ })).toBeInTheDocument()
  })

  it('finds a step inside it, and keeps the goal for context', () => {
    oneBigGoal()
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Show steps under Record the album/ }))
    fireEvent.change(screen.getByRole('searchbox', { name: /Filter .* goals and steps/ }), { target: { value: 'Album step 47' } })
    expect(screen.getByText('Record the album')).toBeInTheDocument()
    expect(screen.getByText('Album step 47')).toBeInTheDocument()
    expect(screen.queryByText('Album step 12')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/Filtering does not change what will be saved/)
  })

  it('stays away from a genuinely short list', () => {
    state.tasks = [
      task({ id: 'g', title: 'Small goal', isGoal: true, monthStart: thisMonth }),
      task({ id: 's1', title: 'One step', goalTaskId: 'g', monthStart: thisMonth }),
    ]
    renderPage('month')
    expect(screen.queryByRole('searchbox', { name: /Filter/ })).toBeNull()
  })
})

// Codex, 2026-09-24: the confirmation fired on the line after the write. A
// refused write must not announce a stored relationship.
describe('linking waits for the write', () => {
  const seasonStart = () => periodStartFor('season', new Date(), DEFAULT_SEASONS)
  beforeEach(() => {
    pinClock(); localStorage.clear()
    state.tasks = [
      task({ id: 'sg1', title: 'A season of repairs', isGoal: true, bucket: 'quarter', seasonStart: seasonStart() }),
      task({ id: 'mg1', title: 'A home easier to care for', isGoal: true, monthStart: thisMonth }),
    ]
    state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
    toastSpy.mockClear()
  })
  afterEach(() => { vi.useRealTimers(); hook.updateTask.mockImplementation(async () => true) })

  /** The editor closes after each choice, so each attempt reopens it. */
  const link = () => {
    fireEvent.click(screen.getByRole('button', { name: /Link to a season goal|Change or remove this link/ }))
    fireEvent.change(screen.getByRole('combobox', { name: /Goal that A home easier to care for supports/ }), { target: { value: 'sg1' } })
  }

  it('says nothing until the write lands, then confirms once', async () => {
    let land: (ok: boolean) => void = () => {}
    hook.updateTask.mockImplementation(() => new Promise((r) => { land = r }))
    renderPage('month')
    link()
    expect(toastSpy).not.toHaveBeenCalled()
    await act(async () => { land(true) })
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/now supports the goal you chose/), 'success', 5000)
  })

  it('refuses to announce a link the write refused', async () => {
    hook.updateTask.mockImplementation(async () => false)
    renderPage('month')
    link()
    await act(async () => {})
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/Couldn’t link .* Nothing changed/), 'error', 6000)
    expect(toastSpy).not.toHaveBeenCalledWith(expect.stringMatching(/now supports/), 'success', expect.anything())
  })

  it('says so when the write throws, and keeps the controls usable for a retry', async () => {
    hook.updateTask.mockImplementationOnce(async () => { throw new Error('offline') })
    renderPage('month')
    link()
    await act(async () => {})
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/Couldn’t link/), 'error', 6000)
    // Not stuck pending: the same control takes a second attempt.
    hook.updateTask.mockImplementation(async () => true)
    link()
    await act(async () => {})
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/now supports/), 'success', 5000)
  })

  it('holds the controls while the write is in flight', async () => {
    let land: (ok: boolean) => void = () => {}
    hook.updateTask.mockImplementation(() => new Promise((r) => { land = r }))
    renderPage('month')
    link()
    expect(screen.getByRole('combobox', { name: /Status of A home easier to care for/ })).toBeDisabled()
    await act(async () => { land(true) })
    expect(screen.getByRole('combobox', { name: /Status of A home easier to care for/ })).not.toBeDisabled()
  })

  it('a refused status change leaves the goal as it was, and says so', async () => {
    hook.updateTask.mockImplementation(async () => false)
    renderPage('month')
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: /Status of A home easier to care for/ }), { target: { value: 'completed' } })
    })
    expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/Couldn’t change the status .* unchanged/), 'error', 6000)
  })

  // The fold exists to get finished goals back.
  it('a completed goal can be reopened from the completed fold', async () => {
    state.tasks = [task({ id: 'mg2', title: 'A finished goal', isGoal: true, monthStart: thisMonth, completed: true })]
    renderPage('month')
    fireEvent.click(screen.getByText(/Completed goals/))
    const status = screen.getByRole('combobox', { name: /Status of A finished goal/ }) as HTMLSelectElement
    expect(status.value).toBe('completed')
    await act(async () => { fireEvent.change(status, { target: { value: 'active' } }) })
    expect(hook.updateTask).toHaveBeenCalledWith('mg2', { completed: false })
  })
})

// Scott, via Codex 2026-09-24: a planning page opens on the plan.
describe('the planning pages no longer open with an onboarding box', () => {
  beforeEach(() => {
    pinClock(); localStorage.clear()
    state.tasks = [task({ id: 'g', title: 'A goal', isGoal: true, monthStart: thisMonth })]
    state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  for (const level of ['month', 'season', 'year'] as const) {
    it(`${level} shows no "Somewhere to start" box`, () => {
      renderPage(level)
      expect(screen.queryByLabelText('Somewhere to start')).toBeNull()
      expect(screen.queryByText(/Pick one, or none/)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Show where to start' })).toBeNull()
    })
  }
})

// Codex acceptance walk, 2026-09-24: the review nested its rows but still
// showed no completed step — the page stripped them before handing them over.
describe('the review is given the completed work too', () => {
  beforeEach(() => {
    pinClock(); localStorage.clear()
    state.tasks = [
      task({ id: 'g1', title: 'Write a new song', isGoal: true, monthStart: thisMonth }),
      task({ id: 's1', title: 'Draft the first verse', goalTaskId: 'g1', monthStart: thisMonth }),
      task({ id: 's2', title: 'Use an old chord progression', goalTaskId: 'g1', monthStart: thisMonth, completed: true }),
    ]
    state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  it('counts the finished step, and shows it struck through', () => {
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: /Plan September|Plan October|Review the plan/ }))
    const counts = screen.getByRole('button', { name: '1 open · 1 done · show' })
    fireEvent.click(counts)
    const done = within(counts.closest('li')!).getByText('Use an old chord progression')
    expect(done.className).toMatch(/line-through/)
    expect(within(done.closest('li')!).getByText('completed')).toBeInTheDocument()
  })
})

// The adjacent branch Codex asked me to inspect after the month fix: the
// year's own list filtered `status === 'active'`, so a goal FINISHED this
// year vanished from the year review — the same defect, one branch over.
describe('the year review is given the completed goals too', () => {
  beforeEach(() => {
    pinClock(); localStorage.clear()
    state.tasks = []
    state.goals = [
      goal({ id: 'yopen', name: 'Run a half marathon' }),
      goal({ id: 'ydone', name: 'Move the family to a bigger house', status: 'completed' }),
      // Archived is the one status that was deliberately let go; it stays out.
      goal({ id: 'ygone', name: 'Learn the cello', status: 'archived' }),
    ]
    state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  it('shows this year’s finished goal, struck through, and still hides the archived one', () => {
    renderPage('year')
    fireEvent.click(screen.getByRole('button', { name: `Plan ${now.getFullYear()}` }))
    // No goals for last year, so the session opens straight on the Plan step.
    const done = screen.getByText('Move the family to a bigger house')
    expect(done.className).toMatch(/line-through/)
    expect(screen.getByText('Run a half marathon')).toBeInTheDocument()
    expect(screen.queryByText('Learn the cello')).not.toBeInTheDocument()
  })
})

// ── Keyboard-only operation of the long list ────────────────────────────────
//
// Codex, 2026-09-24: "Test keyboard-only Tab/Shift-Tab/Enter/Space/Escape
// operation of actual hydrated long-list components: filter, expand, show all,
// completed disclosure, focus visibility/restoration… static geometry is not
// enough."
//
// So this drives the REAL page with real key events — not a static snapshot of
// its markup. What a DOM without layout cannot answer (does the focus ring
// actually paint, does the row fit at 390px) is measured separately, in a real
// browser, by outputs/plan-keyboard.
describe('the long list can be worked entirely from the keyboard', () => {
  const user = () => userEvent.setup({ delay: null })
  const bigGoal = 'Record the album'

  beforeEach(() => {
    pinClock(); localStorage.clear()
    // Long enough for the filter to appear (scannableRows > 8), with one goal
    // past the step-reveal bound and one finished step behind the fold.
    state.tasks = [
      task({ id: 'gbig', title: bigGoal, isGoal: true, monthStart: thisMonth }),
      ...Array.from({ length: 12 }, (_, i) => task({
        id: `sbig${i}`, title: `Album step ${i}`, goalTaskId: 'gbig', monthStart: thisMonth,
        completed: i === 0,
      })),
      ...Array.from({ length: 9 }, (_, i) => task({
        id: `g${i}`, title: `Goal number ${i}`, isGoal: true, monthStart: thisMonth,
      })),
    ]
    state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  /** Tab forward up to `max` times, collecting what each stop focused. */
  const walk = async (u: ReturnType<typeof user>, max = 60) => {
    const seen: string[] = []
    for (let i = 0; i < max; i++) {
      await u.tab()
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) break
      seen.push(`${el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}`)
    }
    return seen
  }

  it('tabs to the filter and the completed fold without leaving the list', async () => {
    const u = user()
    renderPage('month')
    const seen = await walk(u, 20)
    // Reached in order, from the top of the page, with no stop that traps.
    const filter = seen.findIndex((l) => l.startsWith('input:Filter'))
    const fold = seen.findIndex((l) => l === 'button:Show completed steps')
    const firstGoal = seen.findIndex((l) => l.includes('Record the album'))
    expect(filter).toBeGreaterThan(-1)
    expect(fold).toBe(filter + 1)
    expect(firstGoal).toBeGreaterThan(fold)
    // And Shift-Tab walks back out the way it came in.
    const here = document.activeElement
    await u.tab({ shift: true })
    expect(document.activeElement).not.toBe(here)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('opens a goal with Enter, keeping focus on the control that opened it', async () => {
    const u = user()
    renderPage('month')
    const counts = screen.getByRole('button', { name: '11 open · 1 done · show' })
    counts.focus()
    await u.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '11 open · 1 done · hide' })).toBe(document.activeElement)
    await u.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '11 open · 1 done · show' })).toBe(document.activeElement)
  })

  it('works the completed fold with Space, and the label says what it will do', async () => {
    const u = user()
    renderPage('month')
    const fold = screen.getByRole('button', { name: 'Show completed steps' })
    fold.focus()
    await u.keyboard(' ')
    const after = screen.getByRole('button', { name: 'Hide completed steps' })
    expect(after).toBe(document.activeElement)
    await u.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Show completed steps' })).toBe(document.activeElement)
  })

  // The defect this batch found: the button deletes itself, and focus fell to
  // <body> — the top of the page, every goal away from the new steps.
  it('keeps focus in the list when "Show all" removes itself', async () => {
    const u = user()
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: '11 open · 1 done · show' }))
    const showAll = screen.getByRole('button', { name: /Show all 12 steps/ })
    showAll.focus()
    await u.keyboard(' ')
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
    // …and it lands on the first step that just appeared, not back at the top.
    const landed = document.activeElement as HTMLElement
    expect(within(landed.closest('li')!).getByText('Album step 9')).toBeInTheDocument()
  })

  it('clears the filter with Escape and leaves the cursor in it', async () => {
    const u = user()
    renderPage('month')
    const filter = screen.getByLabelText(/Filter .* goals and steps/) as HTMLInputElement
    filter.focus()
    await u.keyboard('album')
    expect(filter.value).toBe('album')
    expect(screen.getByText(/Filtering does not change what will be saved/)).toBeInTheDocument()
    await u.keyboard('{Escape}')
    expect(filter.value).toBe('')
    expect(document.activeElement).toBe(filter)
    expect(screen.getByText('Goal number 0')).toBeInTheDocument()
  })

  // The timing popover is portalled to the end of <body>; without the shared
  // popover-focus hook a keyboard user tabbing off the trigger skipped it.
  it('closes the timing menu with Escape and comes back to its trigger', async () => {
    const u = user()
    renderPage('month')
    fireEvent.click(screen.getByRole('button', { name: '11 open · 1 done · show' }))
    const trigger = document.querySelectorAll('.plan-timing-trigger')[0] as HTMLElement
    trigger.focus()
    await u.keyboard('{Enter}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menu').contains(document.activeElement)).toBe(true)
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })
})

// Live, 2026-09-24: /year opened on "0 goals" with an empty list for as long
// as the goals took to load — a household with three year goals told it had
// none. The page was reading only the TASK load, and the year is drawn from
// goals.
describe('a year whose goals have not arrived does not claim to be empty', () => {
  beforeEach(() => {
    pinClock(); localStorage.clear()
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { state.goalsLoading = false; vi.useRealTimers() })

  it('says it is loading rather than counting a list it does not have', () => {
    state.goalsLoading = true
    renderPage('year')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText(/^0 goals$/)).not.toBeInTheDocument()
  })

  it('counts them once they arrive', () => {
    state.goalsLoading = false
    state.goals = [goal({ name: 'Run a half marathon' })]
    renderPage('year')
    expect(screen.getByText('1 goals')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })
})

// Scott: "Choose when" should say which day has room wherever it offers a day,
// not only on /week. The counting rules are weekDensity.test.ts's; this is the
// month page's wiring to them.
describe('the month page offers day tiles for the week a row is on', () => {
  const weekOfThisMonth = (() => {
    // A Sunday inside the month the page will show.
    const d = new Date(thisMonth)
    d.setDate(d.getDate() + (7 - d.getDay()) % 7)
    return d
  })()

  beforeEach(() => {
    pinClock(); localStorage.clear()
    dayLoad.events = []; dayLoad.available = true; dayLoad.loading = false
    state.tasks = [
      task({ id: 'dated', title: 'Fix the gate', monthStart: thisMonth, weekStart: weekOfThisMonth }),
      task({ id: 'loose', title: 'Call the roofer', monthStart: thisMonth }),
      // On the Friday of that week — a day the planning calendar reaches, so
      // its count is knowable. (The window starts at today; see the past-days
      // case below.)
      task({ id: 'busy', title: 'Already on Friday', monthStart: thisMonth, bucket: 'timed',
        scheduledFor: new Date(weekOfThisMonth.getFullYear(), weekOfThisMonth.getMonth(), weekOfThisMonth.getDate() + 5), isAllDay: true }),
    ]
    state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    Object.values(hook).forEach((f) => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  const openTiming = (title: string) => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Choose a week or a day for ${title}`) }))
  }

  it('draws the seven days of the row’s own week, with what each already holds', () => {
    renderPage('month')
    openTiming('Fix the gate')
    const tiles = screen.getAllByRole('menuitemradio').filter((b) => /^Plan for /.test(b.getAttribute('aria-label') ?? ''))
    expect(tiles).toHaveLength(7)
    // The day the other task sits on says so; the rest say they are empty.
    const busy = tiles.find((t) => /1 task already/.test(t.getAttribute('aria-label') ?? ''))
    expect(busy).toBeDefined()
    // The other six read as empty — including the days of this week already
    // past, which the planning calendar is read back far enough to cover.
    expect(tiles.filter((t) => /nothing on it yet/.test(t.getAttribute('aria-label') ?? ''))).toHaveLength(6)
    expect(tiles.every((t) => !/read for/.test(t.getAttribute('aria-label') ?? ''))).toBe(true)
    // The shared day-choice pattern, not a new one: the other-day path stays,
    // and now reads "Another day…" because tiles came first.
    expect(screen.getByText('Another day…')).toBeInTheDocument()
  })

  it('offers no tiles for a row with no week yet — that row is still choosing a week', () => {
    renderPage('month')
    openTiming('Call the roofer')
    expect(screen.queryAllByRole('menuitemradio').filter((b) => /^Plan for /.test(b.getAttribute('aria-label') ?? ''))).toHaveLength(0)
    // …and the way to a specific day is untouched: the shared other-day path,
    // which reads "A day…" precisely because no tiles precede it.
    expect(screen.getByText('A day…')).toBeInTheDocument()
  })

  it('says a day is not known rather than drawing it empty when the calendar failed', () => {
    dayLoad.available = false
    renderPage('month')
    openTiming('Fix the gate')
    const tiles = screen.getAllByRole('menuitemradio').filter((b) => /^Plan for /.test(b.getAttribute('aria-label') ?? ''))
    expect(tiles).toHaveLength(7)
    expect(tiles.filter((t) => /couldn’t be read/.test(t.getAttribute('aria-label') ?? ''))).toHaveLength(7)
    expect(tiles.some((t) => /nothing on it yet/.test(t.getAttribute('aria-label') ?? ''))).toBe(false)
  })

  it('picking a day from a tile plans that exact day', () => {
    renderPage('month')
    openTiming('Fix the gate')
    const tiles = screen.getAllByRole('menuitemradio').filter((b) => /^Plan for /.test(b.getAttribute('aria-label') ?? ''))
    fireEvent.click(tiles[5])
    const day = new Date(weekOfThisMonth.getFullYear(), weekOfThisMonth.getMonth(), weekOfThisMonth.getDate() + 5)
    expect(hook.updateTask).toHaveBeenCalledWith('dated', expect.objectContaining({ scheduledFor: day }))
  })
})
