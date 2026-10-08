import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

// Open journal on the Month page (Scott chose it, 2026-10-08): each Fall line
// beside October's lines for it. Generic fixtures; mocked data — this proves
// the page's logic, not database permissions.

const tasksHook = vi.hoisted(() => ({
  tasks: [] as unknown[], loading: false, error: null as string | null, refetch: vi.fn(async () => {}),
}))
const w = vi.hoisted(() => ({ addTask: vi.fn(), updateTask: vi.fn(), pushTask: vi.fn(), gated: vi.fn() }))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn(async () => true) }

vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({
    ...tasksHook,
    toggleTask: vi.fn(), updateTask: w.updateTask, addTask: w.addTask, deleteTask: vi.fn(), pushTask: w.pushTask, keepForward: vi.fn(),
    dropCommitment: vi.fn(), updateTasksBulk: vi.fn(), setGoal: vi.fn(), setGoalLink: vi.fn(),
  }),
}))
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, monthToken: () => '2026-11' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: w.gated, pushTask: w.pushTask, updateTasksBulk: vi.fn() }) }))
// The reader is "me": the Fall reference is my scope, as on the real page.
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [], getCurrentUserMember: () => ({ id: 'me' }) }) }))
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
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: 'personal', picker: <span data-testid="area-picker" /> }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/components/domain/DomainSwitcher', () => ({ DomainSwitcher: () => null }))

import type { GuideState } from '@/lib/guide/guidedPlan'
const guide = { state: null as GuideState | null, loaded: true, savedIn: 'account' as const, set: vi.fn(async (s: GuideState | null) => { guide.state = s }) }
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => guide }))

import { PlanPageV2 } from './PlanPageV2'
import { DomainProvider } from '@/hooks/useDomain'

const fall = new Date(2026, 8, 1)
const oct = new Date(2026, 9, 1)
const base = { completed: false, createdAt: fall, updatedAt: fall, assignedTo: 'me' }
const s = (id: string, title: string, o: Record<string, unknown> = {}) => ({ ...base, id, title, bucket: 'quarter', seasonStart: fall, commitments: [{ level: 'season', periodStart: fall, status: 'open' }], ...o })
const m = (id: string, title: string, o: Record<string, unknown> = {}) => ({ ...base, id, title, bucket: 'month', monthStart: oct, commitments: [{ level: 'month', periodStart: oct, status: 'open' }], ...o })
const FIXTURE = [
  s('s1', 'Garden beds ready for winter'), s('s2', 'Calmer mornings'), s('s3', 'Learn three songs'),
  s('sp', 'Another person’s private Fall line', { assignedTo: 'partner' }),
  m('m1', 'Order garlic bulbs', { sourceId: 's1' }), m('m2', 'Clear the shed', { sourceId: 's1' }),
  m('m3', 'Older month goal', { isGoal: true, supportsGoalTaskId: 's2' }),
  m('m4', 'Plan the autumn trip'), m('m5', 'Written for the private line', { sourceId: 'sp' }),
]
function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}|{JSON.stringify(l.state)}</p> }
const renderMonth = (state: unknown = { journal: true }) => render(
  <MemoryRouter initialEntries={[{ pathname: '/month', search: '?start=2026-10-01', state }]}>
    <DomainProvider><Routes><Route path="/month" element={<PlanPageV2 level="month" />} /><Route path="*" element={<Where />} /></Routes></DomainProvider>
  </MemoryRouter>,
)
const region = (name: RegExp) => screen.getByRole('region', { name })
const box = (name: RegExp) => within(region(name)).getByRole('textbox') as HTMLInputElement
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }

describe('Month · Open journal', () => {
  beforeEach(() => {
    guide.state = null; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 8, 10))
    tasksHook.tasks = FIXTURE
    for (const f of Object.values(w)) f.mockReset()
    w.addTask.mockResolvedValue('new-id'); w.updateTask.mockResolvedValue(true)
  })
  afterEach(() => { vi.useRealTimers(); localStorage.clear() })

  it('each Fall line stands beside October’s lines for it — source_id and the older supports link — and the rest are general', () => {
    renderMonth()
    expect(within(region(/^This Fall: Garden beds ready for winter/)).getAllByRole('listitem').map((li) => li.querySelector('.pv2-line-text')?.textContent)).toEqual(['Order garlic bulbs', 'Clear the shed'])
    expect(within(region(/^This Fall: Calmer mornings/)).getByText('Older month goal')).toBeInTheDocument()
    expect(region(/^This Fall: Learn three songs/)).toHaveTextContent('Nothing for October yet')
    const general = region(/Not tied to a Fall line/)
    expect(within(general).getByText('Plan the autumn trip')).toBeInTheDocument()
  })

  it('a Fall line only another person can see makes no section and no title; its October line is general', () => {
    renderMonth()
    expect(screen.queryByText('Another person’s private Fall line')).toBeNull()
    expect(within(region(/Not tied to a Fall line/)).getByText('Written for the private line')).toBeInTheDocument()
  })

  it('Enter adds an October line written for that Fall line (source_id, never goal_task_id), keeps focus, clears only on success', async () => {
    renderMonth()
    const input = box(/^This Fall: Learn three songs/)
    for (const t of ['Pick the three songs', 'Book a lesson']) {
      fireEvent.change(input, { target: { value: t } }); fireEvent.submit(input.closest('form')!)
      await waitFor(() => expect(input.value).toBe(''))
      expect(document.activeElement).toBe(input)
    }
    expect(w.addTask.mock.calls.map((c) => [c[0], c[4]])).toEqual([
      ['Pick the three songs', expect.objectContaining({ bucket: 'month', monthStart: oct, sourceId: 's3', context: 'personal' })],
      ['Book a lesson', expect.objectContaining({ sourceId: 's3' })],
    ])
    expect(w.addTask.mock.calls.every((c) => !('goalTaskId' in c[4]))).toBe(true)
    // The Fall line itself is not touched — no promotion, no move.
    expect(w.updateTask).not.toHaveBeenCalled(); expect(w.gated).not.toHaveBeenCalled(); expect(w.pushTask).not.toHaveBeenCalled()
  })

  it('a slow save keeps newer words and adds nothing twice; a failed one keeps the words', async () => {
    const d = deferred<string>()
    w.addTask.mockReturnValueOnce(d.promise).mockResolvedValueOnce(undefined)
    renderMonth()
    const input = box(/^This Fall: Calmer mornings/)
    fireEvent.change(input, { target: { value: 'Lay out clothes the night before' } }); fireEvent.submit(input.closest('form')!)
    fireEvent.submit(input.closest('form')!)
    fireEvent.change(input, { target: { value: 'Charge phones in the hall' } })
    await act(async () => { d.resolve('id-1'); await d.promise })
    expect(w.addTask).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('Charge phones in the hall')
    fireEvent.submit(input.closest('form')!)
    expect(await within(region(/^This Fall: Calmer mornings/)).findByRole('alert')).toHaveTextContent('That didn’t save')
    expect(input.value).toBe('Charge phones in the hall')
  })

  it('Lists stays the default; its own add box now also clears only once the line is stored', async () => {
    w.addTask.mockResolvedValueOnce(undefined)
    renderMonth(null)
    expect(screen.queryByRole('region', { name: /October, by Fall line/ })).toBeNull()
    const input = screen.getByRole('textbox', { name: 'Add to October' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Sort the winter clothes' } }); fireEvent.submit(input.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('That didn’t save')
    expect(input.value).toBe('Sort the winter clothes')
  })

  it('an October line can be linked, changed, or have its older supports link removed — on the same row', async () => {
    renderMonth()
    fireEvent.click(screen.getByRole('button', { name: 'Link Plan the autumn trip to a Fall line' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Calmer mornings' }))
    await waitFor(() => expect(w.updateTask).toHaveBeenCalledWith('m4', { sourceId: 's2' }))
    fireEvent.click(screen.getByRole('button', { name: /^For Fall: Calmer mornings\. Change or remove the Fall line for Older month goal/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Remove the Fall link' }))
    await waitFor(() => expect(w.updateTask).toHaveBeenLastCalledWith('m3', { supportsGoalTaskId: undefined }))
  })

  it('one onward step for the whole month, carrying the journal into the week — and nothing else', () => {
    renderMonth()
    expect(screen.getAllByRole('group', { name: 'Next step' })).toHaveLength(1)
    expect(screen.getByText('1 Fall line has nothing in October yet — you can leave it for later.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Plan week \d+ · / }))
    expect(screen.getByTestId('where').textContent).toMatch(/\|\{"write":true,"ref":true,"journal":true\}$/)
    expect(w.addTask).not.toHaveBeenCalled(); expect(w.updateTask).not.toHaveBeenCalled()
  })

  // 2026-10-08 review: the same Fall line heads October's and November's
  // journal; a draft or a save in flight must stay with its own month.
  it('changing month gives fresh boxes; a save still running for October lands in October and never touches November', async () => {
    const d = deferred<string>()
    w.addTask.mockReturnValueOnce(d.promise)
    renderMonth()
    const oct = box(/^This Fall: Learn three songs/)
    fireEvent.change(oct, { target: { value: 'Pick the three songs' } }); fireEvent.submit(oct.closest('form')!)
    fireEvent.click(screen.getByRole('button', { name: 'November' }))
    const nov = box(/^This Fall: Learn three songs/)
    expect(nov).not.toBe(oct)
    expect(nov.value).toBe('')
    fireEvent.change(nov, { target: { value: 'Book a lesson' } })
    await act(async () => { d.resolve('id-1'); await d.promise })
    expect(nov.value).toBe('Book a lesson') // untouched by October's result
    expect(screen.queryByRole('alert')).toBeNull()
    expect(w.addTask.mock.calls[0][4]).toMatchObject({ monthStart: new Date(2026, 9, 1), sourceId: 's3' })
    // November's own add goes to November, without waiting on October's.
    fireEvent.submit(nov.closest('form')!)
    await waitFor(() => expect(w.addTask).toHaveBeenCalledTimes(2))
    expect(w.addTask.mock.calls[1][4]).toMatchObject({ monthStart: new Date(2026, 10, 1), sourceId: 's3' })
  })

  it('in Lists too, a draft and a failure belong to their month', async () => {
    w.addTask.mockResolvedValueOnce(undefined)
    renderMonth(null)
    const input = () => screen.getByRole('textbox', { name: /^Add to / }) as HTMLInputElement
    fireEvent.change(input(), { target: { value: 'Sort the winter clothes' } }); fireEvent.submit(input().closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('That didn’t save')
    fireEvent.click(screen.getByRole('button', { name: 'November' }))
    expect(input().value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'October' }))
    expect(input().value).toBe('Sort the winter clothes') // still October's, still unsaved
  })
})
