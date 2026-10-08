import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

// Walkthrough 2026-10-08 (Scott, live): after writing a Fall milestone, and
// again after October's priorities, nothing in the page said what came next.
// The next horizon is now offered beneath the whole list, at rest — resolved
// from the period on screen, never automatic.

const tasksHook = vi.hoisted(() => ({
  tasks: [] as unknown[], loading: false, error: null as string | null, refetch: vi.fn(async () => {}),
}))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn(async () => true) }

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({
    ...tasksHook,
    toggleTask: vi.fn(), updateTask: vi.fn(), addTask: vi.fn(), deleteTask: vi.fn(), pushTask: vi.fn(), keepForward: vi.fn(),
    dropCommitment: vi.fn(), updateTasksBulk: vi.fn(), setGoal: vi.fn(), setGoalLink: vi.fn(),
  }),
}))
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, monthToken: () => '2026-11' }))
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
  useGoalsContext: () => ({ goals: [] }),
}))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/components/domain/DomainSwitcher', () => ({ DomainSwitcher: () => null }))

import type { GuideState } from '@/lib/guide/guidedPlan'
const guide = { state: null as GuideState | null, loaded: true, savedIn: 'account' as const, set: vi.fn(async (s: GuideState | null) => { guide.state = s }) }
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => guide }))

import { PlanPageV2 } from './PlanPageV2'
import { DomainProvider } from '@/hooks/useDomain'

const line = (id: string, title: string, o: Record<string, unknown>) => ({ id, title, completed: false, createdAt: new Date(2026, 8, 1), updatedAt: new Date(2026, 8, 1), ...o })
const fall = new Date(2026, 8, 1)
const oct = new Date(2026, 9, 1)
const fallLine = line('s1', 'Garden beds ready for winter', { bucket: 'quarter', seasonStart: fall, commitments: [{ level: 'season', periodStart: fall, status: 'open' }] })
const octLine = line('m1', 'Plan the autumn trip', { bucket: 'month', monthStart: oct, commitments: [{ level: 'month', periodStart: oct, status: 'open' }] })

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}|{JSON.stringify(l.state)}</p> }
const renderAt = (level: 'season' | 'month', start: string) => render(
  <MemoryRouter initialEntries={[`/${level}?start=${start}`]}>
    <DomainProvider>
      <Routes>
        <Route path={`/${level}`} element={<PlanPageV2 level={level} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </DomainProvider>
  </MemoryRouter>,
)

describe('PlanPageV2 — the next horizon, beneath the whole list', () => {
  beforeEach(() => { guide.state = null; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 8, 10)) })
  afterEach(() => { vi.useRealTimers(); localStorage.clear() })

  it('Fall offers October — the month it is in — with Fall kept beside it, and goes there ready to write', () => {
    tasksHook.tasks = [fallLine]
    renderAt('season', '2026-09-01')
    const next = screen.getByRole('group', { name: 'Next step' })
    expect(next).toHaveTextContent('When Fall’s list looks right: Choose what you want to move forward in October. Fall’s list stays beside it.')
    fireEvent.click(screen.getByRole('button', { name: 'Continue to October →' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/month?start=2026-10-01|{"write":true,"ref":true}')
  })

  it('a season planned ahead hands to its own first month, not this one', () => {
    tasksHook.tasks = [line('s2', 'Ski weekend booked', { bucket: 'quarter', seasonStart: new Date(2026, 11, 1), commitments: [{ level: 'season', periodStart: new Date(2026, 11, 1), status: 'open' }] })]
    renderAt('season', '2026-12-01')
    expect(screen.getByRole('button', { name: 'Continue to December →' })).toBeInTheDocument()
  })

  it('October offers a dated week, says not every priority needs something, and opens it with October beside it', () => {
    tasksHook.tasks = [octLine]
    renderAt('month', '2026-10-01')
    const button = screen.getByRole('button', { name: /^Plan week \d+ · Oct \d+ – Oct \d+ →$/ })
    expect(screen.getByRole('group', { name: 'Next step' })).toHaveTextContent('Not every priority needs something every week')
    fireEvent.click(button)
    expect(screen.getByTestId('where').textContent).toMatch(/^\/week\?start=2026-10-\d\d\|\{"write":true,"ref":true\}$/)
  })

  it('nothing on the list, nothing offered — and it never moves on by itself', () => {
    tasksHook.tasks = []
    renderAt('season', '2026-09-01')
    expect(screen.queryByRole('group', { name: 'Next step' })).toBeNull()
    tasksHook.tasks = [fallLine]
    renderAt('season', '2026-09-01')
    expect(screen.queryByTestId('where')).toBeNull()
  })
})
