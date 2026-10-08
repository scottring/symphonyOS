import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Live, 2026-10-08: the top bar's people filter showed only Alex; an
// unassigned October line was added, the input cleared, and the line never
// appeared. Nothing said why. A save the view hides now says so, beside the
// add row, with Show it — which widens the VIEW and never touches the line.

const writes = vi.hoisted(() => ({
  addTask: vi.fn(async () => 'new-1' as string | undefined),
  updateTask: vi.fn(), gatedUpdate: vi.fn(), updateTasksBulk: vi.fn(), pushTask: vi.fn(),
}))
const area = vi.hoisted(() => ({ value: undefined as 'work' | 'family' | 'personal' | undefined }))

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({
    tasks: [], loading: false, error: null, refetch: vi.fn(async () => {}),
    toggleTask: vi.fn(), updateTask: writes.updateTask, addTask: writes.addTask, deleteTask: vi.fn(), pushTask: writes.pushTask,
    keepForward: vi.fn(), dropCommitment: vi.fn(), updateTasksBulk: writes.updateTasksBulk,
  }),
}))
vi.mock('@/hooks/usePlanningSession', () => ({
  usePlanningSession: () => ({ saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn(async () => true) }),
  monthToken: () => '2026-10',
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: writes.gatedUpdate, pushTask: writes.pushTask, updateTasksBulk: writes.updateTasksBulk }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [{ id: 'me', name: 'Sam' }, { id: 'alex', name: 'Alex' }], getCurrentUserMember: () => ({ id: 'me', name: 'Sam' }) }),
}))
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
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: area.value, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => ({ state: null, loaded: true, savedIn: 'account', set: vi.fn() }) }))

import { PlanPageV2 } from './PlanPageV2'
import { DomainProvider, LAYERS_KEY } from '@/hooks/useDomain'
import { ASSIGNEE_FILTER_KEY } from '@/hooks/useAssigneeFilter'

const renderOctober = () => render(
  <MemoryRouter initialEntries={['/month?start=2026-10-01']}>
    <DomainProvider><PlanPageV2 level="month" /></DomainProvider>
  </MemoryRouter>,
)
const addLine = (title: string) => {
  const input = screen.getByRole('textbox', { name: 'Add to October' })
  fireEvent.change(input, { target: { value: title } })
  fireEvent.submit(input.closest('form')!)
}
// The page's drag layer keeps its own (empty) status region; ours says why.
const findNotice = async () => (await screen.findByText(/It’s hidden because/)).closest('[role="status"]') as HTMLElement
const queryNotice = () => screen.queryByText(/It’s hidden because/)
const storedPeople = () => JSON.parse(localStorage.getItem(ASSIGNEE_FILTER_KEY) ?? '[]')
const storedLayers = () => JSON.parse(localStorage.getItem(LAYERS_KEY) ?? '[]') as string[]

describe('PlanPageV2 — a new line the view hides says so', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 8, 10))
    localStorage.removeItem(ASSIGNEE_FILTER_KEY); localStorage.removeItem(LAYERS_KEY)
    area.value = undefined
    Object.values(writes).forEach((f) => f.mockClear())
  })
  afterEach(() => vi.useRealTimers())

  it('people filter on Alex: an unassigned line is saved, and the page says why it is not shown', async () => {
    localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(['alex']))
    renderOctober()
    // The narrowed view is said in words where the list is.
    expect(screen.getByText('Showing only Alex’s items')).toBeTruthy()
    addLine('Book flu shots')
    const notice = await findNotice()
    expect(notice.textContent).toContain('Saved to October. It’s hidden because you’re showing only Alex’s items.')
    expect(writes.addTask).toHaveBeenCalledTimes(1)
  })

  it('Show it widens only the people filter — nothing is written to the line', async () => {
    localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(['alex']))
    localStorage.setItem(LAYERS_KEY, JSON.stringify(['family', 'unsorted']))
    renderOctober()
    addLine('Book flu shots')
    fireEvent.click(await screen.findByRole('button', { name: 'Show it' }))
    expect(storedPeople()).toEqual([])
    // The areas are left as they were.
    expect(storedLayers().sort()).toEqual(['family', 'unsorted'])
    expect(queryNotice()).toBeNull()
    // No reassignment, re-tag, or any other write to the item.
    expect(writes.updateTask).not.toHaveBeenCalled()
    expect(writes.gatedUpdate).not.toHaveBeenCalled()
    expect(writes.updateTasksBulk).not.toHaveBeenCalled()
    expect(writes.pushTask).not.toHaveBeenCalled()
    expect(writes.addTask).toHaveBeenCalledTimes(1)
  })

  it('a line the view shows gets no notice', async () => {
    renderOctober()
    expect(screen.queryByText(/Showing only/)).toBeNull()
    addLine('Book flu shots')
    await waitFor(() => expect(writes.addTask).toHaveBeenCalled())
    await Promise.resolve()
    expect(queryNotice()).toBeNull()
  })

  it('Dismiss closes the notice and leaves the filter on', async () => {
    localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(['alex']))
    renderOctober()
    addLine('Book flu shots')
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(queryNotice()).toBeNull()
    expect(storedPeople()).toEqual(['alex'])
  })

  it('area filter: a Work line under Family only says so, and Show it adds Work to the view', async () => {
    localStorage.setItem(LAYERS_KEY, JSON.stringify(['family', 'unsorted']))
    area.value = 'work'
    renderOctober()
    expect(screen.getByText('Showing only Family and Unsorted')).toBeTruthy()
    addLine('Quarterly report')
    const notice = await findNotice()
    expect(notice.textContent).toContain('Saved to October. It’s hidden because Work items aren’t shown.')
    fireEvent.click(screen.getByRole('button', { name: 'Show it' }))
    await waitFor(() => expect(storedLayers().sort()).toEqual(['family', 'unsorted', 'work']))
    expect(writes.gatedUpdate).not.toHaveBeenCalled()
    expect(writes.updateTask).not.toHaveBeenCalled()
  })

  it('a failed save says nothing about filters', async () => {
    localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(['alex']))
    writes.addTask.mockResolvedValueOnce(undefined)
    renderOctober()
    addLine('Book flu shots')
    await waitFor(() => expect(writes.addTask).toHaveBeenCalled())
    await Promise.resolve()
    expect(queryNotice()).toBeNull()
  })
})
