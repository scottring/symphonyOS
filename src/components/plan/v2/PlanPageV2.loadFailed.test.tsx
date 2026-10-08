import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// A failed task read drew "Nothing on October's plan yet. Add a line below,
// or start the monthly review." — inviting someone to re-write a plan that
// was there all along.

const tasksHook = vi.hoisted(() => ({
  tasks: [] as unknown[], loading: false, error: null as string | null, refetch: vi.fn(async () => {}),
}))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({
    ...tasksHook,
    toggleTask: vi.fn(), updateTask: vi.fn(), addTask: vi.fn(), deleteTask: vi.fn(), pushTask: vi.fn(), keepForward: vi.fn(),
    dropCommitment: vi.fn(), updateTasksBulk: vi.fn(), setGoal: vi.fn(), setGoalLink: vi.fn(),
  }),
}))
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, monthToken: () => '2026-10' }))
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

import { PlanPageV2 } from './PlanPageV2'
import { DomainProvider } from '@/hooks/useDomain'

// These tests cover the Lists view; Open journal is the default since
// 2026-10-08, so they make the device's choice explicit.
beforeEach(() => { localStorage.setItem('symphony-plan-layout.week', 'lists'); localStorage.setItem('symphony-plan-layout.month', 'lists') })


const renderMonth = () => render(
  <MemoryRouter initialEntries={['/month?start=2026-10-01']}>
    <DomainProvider><PlanPageV2 level="month" /></DomainProvider>
  </MemoryRouter>,
)

describe('PlanPageV2 — the plan list after a failed load', () => {
  beforeEach(() => {
    tasksHook.tasks = []
    tasksHook.error = null
    tasksHook.refetch.mockClear()
  })

  it('says the plan didn’t load, offers Try again, and drops the empty-plan copy', () => {
    tasksHook.error = 'Failed to fetch'
    renderMonth()
    const list = screen.getByRole('region', { name: /plan$/ })
    const notice = within(list).getByRole('alert')
    expect(notice).toHaveTextContent('Your plan didn’t load. It’s safe — this is a connection problem.')
    expect(within(list).queryByText(/Nothing on .*’s list yet/)).toBeNull()
    fireEvent.click(within(notice).getByRole('button', { name: 'Try again' }))
    expect(tasksHook.refetch).toHaveBeenCalledOnce()
  })

  it('an empty plan that did load keeps its empty copy', () => {
    renderMonth()
    const list = screen.getByRole('region', { name: /plan$/ })
    expect(within(list).getByText(/Nothing on .*’s list yet/)).toBeInTheDocument()
    expect(within(list).queryByRole('alert')).toBeNull()
  })
})
