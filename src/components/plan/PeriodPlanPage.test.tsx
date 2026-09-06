import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

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

const state: { tasks: Task[]; goals: Goal[] } = { tasks: [], goals: [] }
const hook = {
  toggleTask: vi.fn(), deleteTask: vi.fn(), updateTask: vi.fn(), updateTasksBulk: vi.fn(),
  addTask: vi.fn(async () => 'new'), setGoal: vi.fn(), pushTask: vi.fn(), keepForward: vi.fn(),
}
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: state.tasks, ...hook }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({
  useGatedTaskActions: (raw: Record<string, unknown>) => raw,
}))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ layers: new Set(['work', 'family', 'personal', 'unsorted']), soleDomain: null }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ getCurrentUserMember: () => ({ id: 'me' }) }) }))
vi.mock('@/hooks/useHouseholdSeasons', () => ({ useHouseholdSeasons: () => ({ seasons: DEFAULT_SEASONS, loading: false, canEdit: true, setSeasons: vi.fn() }) }))
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

import { PeriodPlanPage } from './PeriodPlanPage'

const renderPage = (level: 'month' | 'season' | 'year') =>
  render(<MemoryRouter><PeriodPlanPage level={level} /></MemoryRouter>)

describe('PeriodPlanPage', () => {
  beforeEach(() => {
    state.tasks = []; state.goals = []
    Object.values(hook).forEach((f) => f.mockClear())
    Object.values(goalsApi).forEach((f) => f.mockClear())
  })

  it("This Month: goals first, then tasks, each with its fate; Iris's rows stay out", () => {
    const placed = task({ title: 'Repaint the porch', monthStart: thisMonth })
    state.tasks = [
      placed,
      task({ title: 'Read more', monthStart: thisMonth, isGoal: true }),
      task({ title: 'Repaint the porch', bucket: 'week', sourceId: placed.id }),
      task({ title: "Iris's thing", monthStart: thisMonth, assignedTo: 'iris' }),
      task({ title: 'Legacy row' }),
    ]
    renderPage('month')
    expect(screen.getByRole('heading', { name: 'This Month' })).toBeInTheDocument()
    const list = screen.getByRole('region', { name: /list$/ })
    const titles = within(list).getAllByRole('listitem').map((li) => li.textContent)
    expect(titles[0]).toContain('Read more')
    expect(within(list).getByText('→ placed')).toBeInTheDocument()
    expect(within(list).getByText('Legacy row')).toBeInTheDocument()
    expect(within(list).queryByText("Iris's thing")).not.toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Last month' }))
    expect(screen.getByText(/Look back/)).toBeInTheDocument()
    expect(screen.getByText('Washed the car')).toHaveClass('line-through')
    fireEvent.click(screen.getByRole('button', { name: 'Keep Call the plumber' }))
    expect(hook.keepForward).toHaveBeenCalledWith(open.id, { monthStart: thisMonth })
    fireEvent.click(screen.getByRole('button', { name: 'Someday Call the plumber' }))
    expect(hook.updateTask).toHaveBeenCalledWith(open.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Drop Call the plumber' }))
    expect(hook.deleteTask).toHaveBeenCalledWith(open.id)
    // no composer on a past period
    expect(screen.queryByLabelText('Add to this month')).not.toBeInTheDocument()
  })

  it('adds to the viewed period, as a task or a goal', () => {
    renderPage('month')
    const input = screen.getByLabelText('Add to this month')
    fireEvent.change(input, { target: { value: 'Repaint the porch' } })
    fireEvent.submit(input.closest('form')!)
    expect(hook.addTask).toHaveBeenCalledWith('Repaint the porch', undefined, undefined, undefined,
      expect.objectContaining({ bucket: 'month', monthStart: thisMonth, isGoal: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Add as a goal' }))
    fireEvent.change(input, { target: { value: 'Read more' } })
    fireEvent.submit(input.closest('form')!)
    expect(hook.addTask).toHaveBeenLastCalledWith('Read more', undefined, undefined, undefined,
      expect.objectContaining({ bucket: 'month', isGoal: true }))
  })

  it('This Year lists the goals, with the year rail absent and a goal look-back', () => {
    state.goals = [goal({ name: 'Run a half marathon' }), goal({ name: 'Old goal', year: now.getFullYear() - 1, status: 'completed' })]
    renderPage('year')
    expect(screen.getByRole('heading', { name: 'This Year' })).toBeInTheDocument()
    expect(screen.getByText('Run a half marathon')).toBeInTheDocument()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    // no Someday for a goal, ever
    fireEvent.click(screen.getByRole('button', { name: 'Last year' }))
    expect(screen.getByText('Old goal')).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: /Someday/ })).not.toBeInTheDocument()
  })

  it('This Season lists quarter rows with the year goals folded beneath', () => {
    state.tasks = [task({ title: 'Fall trips', bucket: 'quarter' })]
    state.goals = [goal({ name: 'Run a half marathon' })]
    renderPage('season')
    expect(screen.getByRole('heading', { name: 'This Season' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /list$/ })).getByText('Fall trips')).toBeInTheDocument()
    const rail = screen.getByRole('complementary', { name: 'This Year' })
    fireEvent.click(within(rail).getByRole('button', { name: /This Year/ }))
    expect(within(rail).getByText('Run a half marathon')).toBeInTheDocument()
    // the year rail is look-only
    expect(within(rail).queryByRole('button', { name: /Add to/ })).not.toBeInTheDocument()
  })
})

describe('PeriodPlanPage masthead', () => {
  it('wears the shared masthead card with the period in the eyebrow and the page name as the title', () => {
    renderPage('month')
    const card = screen.getByTestId('masthead-card')
    expect(within(card).getByRole('heading', { level: 1, name: 'This Month' })).toBeInTheDocument()
    const eyebrow = screen.getByTestId('masthead-eyebrow')
    expect(within(eyebrow).getByLabelText('Previous month')).toBeInTheDocument()
    expect(within(eyebrow).getByLabelText('Next month')).toBeInTheDocument()
  })
})
