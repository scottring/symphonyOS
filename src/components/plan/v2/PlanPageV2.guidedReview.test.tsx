import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// "Pick up where you are" (2026-10-01): a guided look-back runs on the page
// it hands to. The page's own Plan button steps aside under the guide, so
// before this a guided run never asked about last month's open lines.

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

import type { GuideState } from '@/lib/guide/guidedPlan'
const guide = { state: null as GuideState | null, loaded: true, savedIn: 'account' as const, set: vi.fn(async (s: GuideState | null) => { guide.state = s }) }
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => guide }))

import { PlanPageV2 } from './PlanPageV2'
import { DomainProvider } from '@/hooks/useDomain'

const sep = new Date(2026, 8, 1)
const open = (id: string, title: string) => ({
  id, title, completed: false, bucket: 'month', monthStart: sep, createdAt: sep, updatedAt: sep,
  commitments: [{ level: 'month', periodStart: sep, status: 'open' }],
})
const run = (steps: GuideState['steps']): GuideState => ({
  v: 1, route: 'pickup', steps, periods: { 'month-review': '2026-10-01', month: '2026-10-01', week: '2026-09-26', today: '2026-10-01' },
  current: 0, done: [], status: 'active', updatedAt: '',
})
const renderOctober = () => render(
  <MemoryRouter initialEntries={['/month?start=2026-10-01']}>
    <DomainProvider><PlanPageV2 level="month" /></DomainProvider>
  </MemoryRouter>,
)

describe('PlanPageV2 — a guided look-back', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 1, 10))
    tasksHook.tasks = [open('t1', 'Get the passports renewed')]
    guide.set.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('October’s page closes out what September left open', () => {
    guide.state = run(['month-review', 'month', 'today'])
    renderOctober()
    expect(screen.getByText('Close out September · 1 of 1')).toBeTruthy()
    expect(screen.getByText('Get the passports renewed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Carry to October' })).toBeTruthy()
  })

  it('without the guide on that step, the page is its ordinary self', () => {
    guide.state = { ...run(['month-review', 'month', 'today']), current: 1, done: ['month-review'] }
    renderOctober()
    expect(screen.queryByText(/Close out September/)).toBeNull()
  })

  it('the last card moves the guide on — to the week when October is already planned', async () => {
    guide.state = run(['month-review', 'week', 'today'])
    renderOctober()
    fireEvent.click(screen.getByRole('button', { name: 'Leave it in September' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Continue to week \d+ →$/ }))
    await waitFor(() => expect(guide.set).toHaveBeenCalledWith(expect.objectContaining({ current: 1, done: ['month-review'] })))
  })
})
