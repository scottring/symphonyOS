import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'

const h = vi.hoisted(() => ({
  gatedUpdate: vi.fn(),
  dayPlan: null as null | { unfinished: unknown[] },
}))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-10-3' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: vi.fn(), updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), addTask: vi.fn() }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: h.gatedUpdate, pushTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ plan: h.dayPlan, loading: false, error: false }) }))

import { WeekV2 } from './WeekV2'

const WEEK = new Date(2026, 9, 3) // Sat Oct 3 – Fri Oct 9
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 3, 12))
  h.gatedUpdate.mockReset(); h.gatedUpdate.mockResolvedValue(true); h.dayPlan = null
})
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const task = (o: Partial<Task>) => ({ completed: false, createdAt: new Date(2026, 8, 1), assignedTo: 'me', ...o }) as Task
const renderWeek = (tasks: Task[] = []) => render(
  <MemoryRouter><WeekV2 tasks={tasks} weekStart={WEEK} meId="me" isCurrent days={<p>days</p>} onSelectTask={vi.fn()} /></MemoryRouter>,
)

// Scott, 2026-10-03: planning moves from the source to the list to a day, so
// the page reads that way — and the month's column holds only its own lines.
describe('WeekV2 — source first', () => {
  it('reads the month, then this week’s list, then the days', () => {
    const { container } = renderWeek([task({ id: 'o1', title: 'Plan Thanksgiving', bucket: 'month', monthStart: new Date(2026, 9, 1) })])
    fireEvent.click(screen.getByRole('button', { name: /^With / }))
    const cols = [...container.querySelector('.pv2-wgrid')!.children].map((c) => c.getAttribute('aria-label'))
    expect(cols).toEqual(['October, for reference', null, 'The days'])
    expect(container.querySelector('.pv2-wgrid > .pv2-wside')).toBe(container.querySelector('.pv2-wgrid')!.children[1])
  })

  it('the List view keeps the same direction: the list, then the days', () => {
    const { container } = renderWeek()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const grid = container.querySelector('.pv2-wgrid')!
    expect(grid.children[0].className).toBe('pv2-wside')
    expect(grid.children[1].getAttribute('aria-label')).toBe('The days')
  })

  it('the month column lists no earlier work and no routines', () => {
    h.dayPlan = { unfinished: [{ key: 'task:e1', kind: 'task', id: 'e1', title: 'Transfer plants', completed: false, task: task({ id: 'e1', title: 'Transfer plants', scheduledFor: new Date(2026, 8, 30), isAllDay: true }), context: 'Originally Wednesday' }] }
    renderWeek()
    fireEvent.click(screen.getByRole('button', { name: /^With / }))
    expect(screen.queryByText('Earlier, not done')).toBeNull()
    expect(screen.queryByText('Routines with no set time')).toBeNull()
    expect(screen.queryByText('Transfer plants')).toBeNull()
  })
})

// Scott, 2026-10-03: "move earlier into look back".
describe('WeekV2 — earlier work is decided in the look-back', () => {
  const earlier = task({ id: 'e1', title: 'Transfer plants', scheduledFor: new Date(2026, 8, 30), isAllDay: true })
  beforeEach(() => {
    h.dayPlan = { unfinished: [{ key: 'task:e1', kind: 'task', id: 'e1', title: 'Transfer plants', completed: false, task: earlier, context: 'Originally Wednesday' }] }
  })

  it('offers the look-back, and shows where the work was meant to happen', () => {
    renderWeek([earlier])
    fireEvent.click(screen.getByRole('button', { name: 'Look back at last week' }))
    expect(screen.getByRole('heading', { name: /Transfer plants/ })).toBeTruthy()
    expect(screen.getByText('Originally Wednesday')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Leave it for now' })).toBeTruthy()
  })

  it('"Carry to this week" puts it on this week’s list, any day', async () => {
    renderWeek([earlier])
    fireEvent.click(screen.getByRole('button', { name: 'Look back at last week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Carry to this week' }))
    await waitFor(() => expect(h.gatedUpdate).toHaveBeenCalled())
    const [id, updates] = h.gatedUpdate.mock.calls[0]
    expect(id).toBe('e1')
    expect(updates).toMatchObject({ bucket: 'week', weekStart: WEEK, scheduledFor: undefined })
  })

  it('"Drop it" lets go of its old day', async () => {
    renderWeek([earlier])
    fireEvent.click(screen.getByRole('button', { name: 'Look back at last week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Drop it' }))
    await waitFor(() => expect(h.gatedUpdate).toHaveBeenCalled())
    const [id, updates] = h.gatedUpdate.mock.calls[0]
    expect(id).toBe('e1')
    expect('scheduledFor' in updates && updates.scheduledFor === undefined).toBe(true)
  })
})
