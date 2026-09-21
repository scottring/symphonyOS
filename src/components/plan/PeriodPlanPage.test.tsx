import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Routine } from '@/types/actionable'
import { DEFAULT_SEASONS, type Seasons } from '@/lib/cadence/seasons'

// ── Hook mocks: the page is a pure function of these ─────────────────────────
const now = new Date()
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

const state: { tasks: Task[]; goals: Goal[]; loading: boolean } = { tasks: [], goals: [], loading: false }
const hook = {
  toggleTask: vi.fn(), deleteTask: vi.fn(), updateTask: vi.fn(), updateTasksBulk: vi.fn(),
  addTask: vi.fn(async () => 'new'), setGoal: vi.fn(), pushTask: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(),
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
  useGoalsContext: () => ({ goals: state.goals, areas: [{ id: 'a1', name: 'General' }], ...goalsApi }),
}))
vi.mock('@/lib/today/domainFilter', () => ({
  filterTasksForLayers: (t: Task[]) => t,
  matchesLayers: () => true,
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
  beforeEach(() => {
    state.tasks = []; state.goals = []; state.loading = false; routinesState.routines = []
    domainState.layers = new Set(['work', 'family', 'personal', 'unsorted']); domainState.soleDomain = null
    seasonsState.seasons = DEFAULT_SEASONS; seasonsState.loading = false
    localStorage.clear()
    Object.values(hook).forEach((f) => f.mockClear())
    Object.values(goalsApi).forEach((f) => f.mockClear())
    mockNavigate.mockClear()
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
    expect(within(goals).getByRole('heading', { name: `${monthName} goals` })).toBeInTheDocument()
    expect(within(list).getByRole('heading', { name: `${monthName} tasks` })).toBeInTheDocument()
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
      routine({ name: 'Kitchen laundry', recurrence_pattern: { type: 'weekly' } }),
      routine({ name: 'Family planning', recurrence_pattern: { type: 'weekly', days: ['sun'] } }),
    ]
    renderPage('month')
    const panel = screen.getByRole('region', { name: 'Recurring commitments' })
    // Folded by default, with a count.
    expect(within(panel).queryByText('Kitchen laundry')).not.toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: /Recurring commitments/ }))
    expect(within(panel).getByText('Kitchen laundry')).toBeInTheDocument()
    expect(within(panel).getByText(/Every week/)).toBeInTheDocument()
    // describeRecurrence is the app's one cadence vocabulary — the page does
    // not invent a second one.
    expect(within(panel).getByText(/Every Sun$/)).toBeInTheDocument()
    // A pattern is reference: nothing here can be ticked off.
    expect(within(panel).queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('checkbox')).not.toBeInTheDocument()
    // Each entry opens the routine itself.
    fireEvent.click(within(panel).getByText('Kitchen laundry'))
    expect(mockNavigate).toHaveBeenCalledWith(`/routines/${routinesState.routines[0].id}`)
  })

  it('only the CURRENT period claims the routines are its own — there is no routine history', () => {
    routinesState.routines = [routine({ name: 'Kitchen laundry' })]
    renderPage('month')
    expect(screen.getByRole('region', { name: 'Recurring commitments' })).toBeInTheDocument()
    // Page back: the same patterns are all we know, so the heading stops
    // claiming they were August's.
    fireEvent.click(screen.getByRole('button', { name: `Review ${lastMonth.toLocaleDateString('en-US', { month: 'long' })}` }))
    expect(screen.queryByRole('region', { name: 'Recurring commitments' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Current recurring commitments' })).toBeInTheDocument()
  })

  it('the year plans in goals alone — no routine patterns, no calendar', () => {
    routinesState.routines = [routine({ name: 'Kitchen laundry' })]
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

  it('a month row can be taken into the week, or straight to today', () => {
    const t = task({ title: 'Fix the back door', monthStart: thisMonth })
    state.tasks = [t]
    renderPage('month')
    // Down a rung: a COPY, so September's list keeps the row and its look-back
    // still sees the whole plan.
    fireEvent.click(screen.getByRole('button', { name: 'Take it into this week Fix the back door' }))
    expect(hook.pushTask).toHaveBeenCalledWith(t.id, 'week')
    // Today (S4) dates it today AND chooses it; the placement module keeps
    // its month commitment.
    hook.pushTask.mockClear()
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
    expect(hook.pushTask).toHaveBeenCalledWith(expect.any(String), 'month')
  })

  it('the current period offers tick and change-of-kind; no look-back verbs', () => {
    state.tasks = [task({ title: 'Repaint', monthStart: thisMonth })]
    renderPage('month')
    expect(screen.getByRole('button', { name: 'Complete Repaint' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make it a goal Repaint' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep Repaint' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Make it a goal Repaint' }))
    expect(hook.setGoal).toHaveBeenCalledWith(expect.any(String), true)
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
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
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
  beforeEach(() => {
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
    fireEvent.click(screen.getByRole('button', { name: /Put it under a goal Renew car registration/i }))
    const picker = screen.getByRole('dialog', { name: /Put it under a goal/i })
    fireEvent.click(within(picker).getByRole('button', { name: /Transform the porch/i }))
    expect(hook.updateTask).toHaveBeenCalledWith('l1', { goalTaskId: 'g1' })
  })

  it('offers no "under a goal" verb when the period has no goals', () => {
    state.tasks = [task({ id: 'l1', title: 'Renew car registration', monthStart: thisMonth })]
    renderPage('month')
    expect(screen.queryByRole('button', { name: /Put it under a goal/i })).not.toBeInTheDocument()
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
