import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Walkthrough run 3 (2026-10-02): one screen per rung (#7/#9), no closing a
// month out with weeks still to run (#34), and a list read under the goals
// one rung up it serves (#14).

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

const oct = new Date(2026, 9, 1)
const octOpen = (id: string, title: string) => ({
  id, title, completed: false, bucket: 'month', monthStart: oct, createdAt: oct, updatedAt: oct,
  commitments: [{ level: 'month', periodStart: oct, status: 'open' }],
})
const renderAt = (start: string) => render(
  <MemoryRouter initialEntries={[`/month?start=${start}`]}>
    <DomainProvider><PlanPageV2 level="month" /></DomainProvider>
  </MemoryRouter>,
)

describe('PlanPageV2 — one screen per rung', () => {
  beforeEach(() => { guide.state = null; session.save.mockClear() })
  afterEach(() => vi.useRealTimers())

  it('on Oct 2, November does not close October out: one tap marks it planned', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 2, 10))
    tasksHook.tasks = [octOpen('t1', 'Come up with October business plan')]
    renderAt('2026-11-01')
    expect(screen.queryByRole('button', { name: /Look back at October/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mark November planned' }))
    await waitFor(() => expect(session.save).toHaveBeenCalled())
    expect(screen.queryByRole('region', { name: /Planning November/ })).toBeNull()
  })

  it('from October’s last week, November opens by looking back at it', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 27, 10))
    tasksHook.tasks = [octOpen('t1', 'Come up with October business plan')]
    renderAt('2026-11-01')
    fireEvent.click(screen.getByRole('button', { name: 'Look back at October' }))
    expect(screen.getByText('Close out October · 1 of 1')).toBeTruthy()
    // The verdict is the step's main button; marking planned stays quiet.
    expect(screen.getByRole('button', { name: 'Mark November planned' }).className).toBe('pv2-qbtn')
    expect(screen.getByText(/^October left work open\./)).toBeTruthy()
  })

  it('a line carried in by the look-back says where it came from (#31)', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 3, 10))
    const nov = new Date(2026, 10, 1)
    tasksHook.tasks = [{
      id: 't1', title: 'Come up with a business plan', completed: false, bucket: 'month', monthStart: nov, createdAt: oct, updatedAt: nov,
      commitments: [{ level: 'month', periodStart: oct, status: 'carried', carriedTo: nov }, { level: 'month', periodStart: nov, status: 'open' }],
    }]
    renderAt('2026-11-01')
    expect(screen.getByText('carried from October')).toBeTruthy()
  })
})
