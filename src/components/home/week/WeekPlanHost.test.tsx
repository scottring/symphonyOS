import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createMockTask } from '@/test/mocks/factories'
import { WeekPlanHost } from './WeekPlanHost'

const hook = { keepForward: vi.fn(async (id: string) => id), dropCommitment: vi.fn(async () => true), completeTask: vi.fn(async () => true),
  addTask: vi.fn(async (_t: string, _a: unknown, _b: unknown, _c: unknown, o: { id: string }) => o.id), updateTask: vi.fn(async () => true), pushTask: vi.fn(), updateTasksBulk: vi.fn() }
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ ...hook, tasks: [], loading: false }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: (fns: unknown) => fns }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useDomain', () => ({ useDomain: () => ({ layers: new Set(), soleDomain: null }) }))
vi.mock('@/hooks/useHouseholdSeasons', () => ({ useHouseholdSeasons: () => ({ seasons: [], loading: false }) }))
const session = { saved: null as null | { at: Date; authorId: string; notes: Record<string, unknown> }, mine: null, loading: false, loadedToken: '2026-10-4', error: null, reload: vi.fn(), save: vi.fn(async () => true) }
vi.mock('@/hooks/usePlanningSession', async (orig) => ({ ...(await orig<object>()), usePlanningSession: () => session }))

const LAST = new Date(2026, 8, 27), WEEK = new Date(2026, 9, 4)
const open = createMockTask({ id: 'o', title: 'Bike rack', bucket: 'week', weekStart: LAST, commitments: [{ level: 'week', periodStart: LAST, status: 'open' }] })
const monthTask = createMockTask({ id: 'm', title: 'Three bids', bucket: 'month', monthStart: new Date(2026, 9, 1), commitments: [{ level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }] })

const mount = () => render(<MemoryRouter><WeekPlanHost tasks={[open, monthTask]} weekStart={WEEK} meId={null} isPast={false}>{() => <div>the days</div>}</WeekPlanHost></MemoryRouter>)

describe('WeekPlanHost', () => {
  // WEEK is "this week" only if the clock says so — the copy turns on it.
  afterAll(() => { vi.useRealTimers() })
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date(2026, 9, 6, 9)); localStorage.clear(); Object.values(hook).forEach((f) => f.mockClear()); session.save.mockClear(); session.saved = null })

  it('says the week is not planned, opens the session in place of the days, and saves every decision once', async () => {
    mount()
    expect(screen.getByText('Not planned yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Plan this week' }))
    expect(screen.queryByText('the days')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: /next: plan this week/i }))
    fireEvent.click(screen.getByRole('button', { name: /add to this week: three bids/i }))
    fireEvent.change(screen.getByLabelText(/new task for this week/i), { target: { value: 'Call the plumber' } })
    fireEvent.click(screen.getByRole('button', { name: /add task/i }))
    fireEvent.click(screen.getByRole('button', { name: /next: save/i }))
    expect(hook.keepForward).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /save this week/i }))
    await waitFor(() => expect(screen.getByText(/the week is planned/i)).toBeInTheDocument())
    expect(hook.keepForward).toHaveBeenCalledWith('o', { weekStart: WEEK }, LAST)
    expect(hook.updateTask).toHaveBeenCalledWith('m', { bucket: 'week', weekStart: WEEK })
    expect(hook.addTask).toHaveBeenCalledWith('Call the plumber', undefined, undefined, undefined, expect.objectContaining({ bucket: 'week', weekStart: WEEK }))
    expect(session.save).toHaveBeenCalledTimes(1)
    expect(screen.getByText('the days')).toBeInTheDocument()
  })

  it('shows Planned <date> and "Review the plan" once a session is saved', () => {
    session.saved = { at: new Date(2026, 9, 4), authorId: 'u2', notes: {} }
    mount()
    expect(screen.getByText('Planned Oct 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review the plan' })).toBeInTheDocument()
  })
})
