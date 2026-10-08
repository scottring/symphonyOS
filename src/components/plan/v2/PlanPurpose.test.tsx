import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

// Friends-and-family walk, 2026-10-08: the ordinary Year, Season and Month
// pages gave little direction. An empty Year said nothing was planned and
// offered "Mark planned" but no help with what to write; Season had its list
// and status but no onward step; "Plan with guidance" was three menus away.

const tasksHook = vi.hoisted(() => ({
  tasks: [] as unknown[], loading: false, error: null as string | null, refetch: vi.fn(async () => {}),
  addTask: vi.fn(async (..._a: unknown[]) => 'new-id' as string | undefined),
}))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn(async () => true) }
const goalsHook = vi.hoisted(() => ({
  goals: [] as unknown[], areas: [{ id: 'a1' }], loading: false,
  addGoal: vi.fn(async (..._a: unknown[]) => ({ id: 'g1' }) as unknown), updateGoal: vi.fn(), addArea: vi.fn(),
}))

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({
    ...tasksHook,
    toggleTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn(), pushTask: vi.fn(), keepForward: vi.fn(),
    dropCommitment: vi.fn(), updateTasksBulk: vi.fn(), setGoal: vi.fn(), setGoalLink: vi.fn(),
  }),
}))
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, monthToken: () => '2026-10', yearToken: () => '2026' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [], getCurrentUserMember: () => undefined }) }))
vi.mock('@/hooks/useHouseholdSeasons', async () => {
  const { DEFAULT_SEASONS } = await import('@/lib/cadence/seasons')
  return { useHouseholdSeasons: () => ({ seasons: DEFAULT_SEASONS }) }
})
vi.mock('@/hooks/useDayLoadEvents', () => ({ useDayLoadEvents: () => ({ events: [] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('@/contexts/GoalsContext', () => ({
  GoalsProvider: ({ children }: { children: React.ReactNode }) => children,
  useGoalsContext: () => goalsHook,
}))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/components/domain/DomainSwitcher', () => ({ DomainSwitcher: () => null }))

import type { GuideState } from '@/lib/guide/guidedPlan'
const guide = { state: null as GuideState | null, loaded: true, savedIn: 'account' as const, set: vi.fn(async (s: GuideState | null) => { guide.state = s }) }
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => guide }))

import { PlanPageV2 } from './PlanPageV2'
import { YearPageV2 } from './YearPageV2'
import { DomainProvider } from '@/hooks/useDomain'

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}</p> }
const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <DomainProvider>
      <Routes>
        <Route path="/year" element={<YearPageV2 />} />
        <Route path="/season" element={<PlanPageV2 level="season" />} />
        <Route path="/month" element={<PlanPageV2 level="month" />} />
        <Route path="*" element={null} />
      </Routes>
      <Where />
    </DomainProvider>
  </MemoryRouter>,
)

const guideState = (status: GuideState['status']): GuideState => ({
  v: 1, route: 'month', steps: ['month', 'week', 'today'], periods: { month: '2026-10-01', week: '2026-10-04', today: '2026-10-08' },
  current: 0, done: [], status, updatedAt: '2026-10-08T09:00:00.000Z',
})

describe('ordinary planning pages say what they are for', () => {
  beforeEach(() => {
    // Mid-month, mid-season: no look-ahead to November or Winter.
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 8, 10))
    guide.state = null
    tasksHook.tasks = []; tasksHook.addTask.mockClear(); goalsHook.goals = []; goalsHook.addGoal.mockClear()
    try { localStorage.clear() } catch { /* none */ }
  })
  afterEach(() => vi.useRealTimers())

  it('an empty Year says what it is for and shows the kind of thing to write', () => {
    renderAt('/year?start=2026-01-01')
    expect(screen.getByText('What do you want this year to hold? A few words is enough.')).toBeTruthy()
    expect(screen.getByText(/Nothing on 2026’s list yet\. Try a few words, like “More time outdoors as a family”/)).toBeTruthy()
    // The old empty line gave no help at all.
    expect(screen.queryByText(/That’s fine\./)).toBeNull()
    expect(screen.getByRole('link', { name: 'Plan with guidance' }).getAttribute('href')).toBe('/start')
  })

  it('adding a line to the Year says it is saved', async () => {
    renderAt('/year?start=2026-01-01')
    const input = screen.getByRole('textbox', { name: 'Add to 2026' })
    fireEvent.change(input, { target: { value: 'More time outdoors' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(goalsHook.addGoal).toHaveBeenCalled())
    const status = await screen.findByText(/Saved to 2026/)
    expect(status.closest('[role="status"]')!.textContent).toBe('Saved to 2026 — “More time outdoors”')
  })

  it('the Year leads on to its season', () => {
    renderAt('/year?start=2026-01-01')
    fireEvent.click(screen.getByRole('button', { name: 'Next: write Fall’s list →' }))
    expect(screen.getByTestId('where').textContent).toBe('/season?start=2026-09-01')
  })

  it('adding a line to Fall says “Saved to Fall”', async () => {
    renderAt('/season?start=2026-09-01')
    expect(screen.getByText('Everything you’d like Fall to hold — a brainstorm list. Nothing needs a date.')).toBeTruthy()
    const input = screen.getByRole('textbox', { name: 'Add to Fall' })
    fireEvent.change(input, { target: { value: 'Swim twice a week' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(tasksHook.addTask).toHaveBeenCalled())
    const note = (await screen.findByText(/Saved to Fall/)).closest('[role="status"]')!
    expect(note.textContent).toBe('Saved to Fall — “Swim twice a week”')
  })

  it('a failed add says nothing was saved', async () => {
    tasksHook.addTask.mockResolvedValueOnce(undefined)
    renderAt('/season?start=2026-09-01')
    const input = screen.getByRole('textbox', { name: 'Add to Fall' })
    fireEvent.change(input, { target: { value: 'Swim' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(tasksHook.addTask).toHaveBeenCalled())
    expect(screen.queryByText(/Saved to Fall/)).toBeNull()
  })

  it('Fall leads on to October', () => {
    renderAt('/season?start=2026-09-01')
    fireEvent.click(screen.getByRole('button', { name: 'Next: choose a few things for October →' }))
    expect(screen.getByTestId('where').textContent).toBe('/month?start=2026-10-01')
  })

  it('October says what a month list is and leads on to this week', () => {
    renderAt('/month?start=2026-10-01')
    expect(screen.getByText('What should October move forward? A plain list, with Fall beside it to look at.')).toBeTruthy()
    expect(screen.getByText(/Nothing on October’s list yet\. Try a few words/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next: choose this week’s steps →' }))
    // Sunday weeks by default: the week holding Thu Oct 8 starts Oct 4.
    expect(screen.getByTestId('where').textContent).toBe('/week?start=2026-10-04')
  })

  it('marking the period planned says so, and the onward step is not offered twice', async () => {
    renderAt('/season?start=2026-09-01')
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark Fall planned' })[0])
    await waitFor(() => expect(session.save).toHaveBeenCalled())
    const saved = await screen.findByText('Fall is planned.')
    expect(saved.closest('[role="status"]')).toBeTruthy()
    expect(within(saved.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Write October’s list →' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Next: / })).toBeNull()
  })

  it('a paused guide is offered back, not started again', () => {
    guide.state = guideState('paused')
    renderAt('/season?start=2026-09-01')
    expect(screen.queryByRole('link', { name: 'Plan with guidance' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resume guidance' }))
    expect(guide.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }))
    expect(screen.getByTestId('where').textContent).toBe('/month?start=2026-10-01')
  })

  it('while a guided plan runs, the page leaves the asking to the guide bar', () => {
    guide.state = guideState('active')
    renderAt('/month?start=2026-10-01')
    expect(screen.queryByText(/What should October move forward/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Next: / })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Plan with guidance' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resume guidance' })).toBeNull()
  })
})
