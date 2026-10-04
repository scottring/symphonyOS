import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'

const h = vi.hoisted(() => ({
  gatedUpdate: vi.fn(),
  dayPlan: null as null | { unfinished: unknown[] },
}))
const session = { saved: null as null | { at: Date; authorId: string; notes?: { focus?: string } }, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-10-3' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: vi.fn(), updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), addTask: vi.fn() }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: h.gatedUpdate, pushTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [{ id: 'sk', name: 'Scott', initials: 'S', color: 'blue' }, { id: 'ir', name: 'Iris', initials: 'I', color: 'purple' }] }) }))
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
const renderDays = vi.fn((o: Record<string, unknown>) => <p>days {JSON.stringify({ ...o, members: undefined })}</p>)
const renderWeek = (tasks: Task[] = []) => render(
  <MemoryRouter><WeekV2 tasks={tasks} weekStart={WEEK} meId="me" isCurrent renderDays={renderDays} onSelectTask={vi.fn()} /></MemoryRouter>,
)

// Scott, 2026-10-04: "lists above the week are for looking; the week and the
// day are for doing". The page is the week's list beside its days; the month
// is one click away, plain, and nothing on it has to come down.
describe('WeekV2 — the week at rest', () => {
  it('is the week’s list beside the days, the month behind one link', () => {
    const { container } = renderWeek([task({ id: 'o1', title: 'Plan Thanksgiving', bucket: 'month', monthStart: new Date(2026, 9, 1) })])
    const page = container.querySelector('.wk-page')!
    expect([...page.children].map((c) => c.className)).toEqual(['wk-listcol', 'pv2-days wk-days'])
    const ref = () => screen.queryByRole('complementary', { name: 'October, for reference' })
    expect(ref()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /October list/ }))
    expect([...page.children].map((c) => c.getAttribute('aria-label') ?? c.className)).toEqual(['October, for reference', 'wk-listcol', 'The days'])
    expect(within(ref()!).getByText('Plan Thanksgiving')).toBeInTheDocument()
    // Remembered, and hidden again from its own heading.
    expect(localStorage.getItem('symphony-week-ref')).toBe('open')
    fireEvent.click(screen.getByRole('button', { name: 'Hide October' }))
    expect(ref()).toBeNull()
  })

  it('the month is a plain list: no goal marks, no steps, and it stays whole', () => {
    localStorage.setItem('symphony-week-ref', 'open')
    renderWeek([
      task({ id: 'g1', title: 'Plan sabbatical', bucket: 'month', monthStart: new Date(2026, 9, 1), isGoal: true }),
      task({ id: 'o2', title: 'Toss umbrella', bucket: 'month', monthStart: new Date(2026, 9, 1), completed: true }),
    ])
    const ref = screen.getByRole('complementary', { name: 'October, for reference' })
    expect(ref.querySelector('[data-mark="goal"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /\+ Step|Week 41’s part/ })).toBeNull()
    expect(screen.getByText('Toss umbrella')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Plan sabbatical to this week' })).toBeInTheDocument()
  })

  it('the month lists no earlier work and no routines', () => {
    localStorage.setItem('symphony-week-ref', 'open')
    h.dayPlan = { unfinished: [{ key: 'task:e1', kind: 'task', id: 'e1', title: 'Transfer plants', completed: false, task: task({ id: 'e1', title: 'Transfer plants', scheduledFor: new Date(2026, 8, 30), isAllDay: true }), context: 'Originally Wednesday' }] }
    renderWeek()
    expect(screen.queryByText('Earlier, not done')).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
    expect(screen.getByRole('heading', { name: /Transfer plants/ })).toBeTruthy()
    expect(screen.getByText('Originally Wednesday')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Leave it for now' })).toBeTruthy()
  })

  it('"Carry to this week" puts it on this week’s list, any day', async () => {
    renderWeek([earlier])
    fireEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Carry to this week' }))
    await waitFor(() => expect(h.gatedUpdate).toHaveBeenCalled())
    const [id, updates] = h.gatedUpdate.mock.calls[0]
    expect(id).toBe('e1')
    expect(updates).toMatchObject({ bucket: 'week', weekStart: WEEK, scheduledFor: undefined })
  })

  it('"Drop it" lets go of its old day', async () => {
    renderWeek([earlier])
    fireEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Drop it' }))
    await waitFor(() => expect(h.gatedUpdate).toHaveBeenCalled())
    const [id, updates] = h.gatedUpdate.mock.calls[0]
    expect(id).toBe('e1')
    expect('scheduledFor' in updates && updates.scheduledFor === undefined).toBe(true)
  })
})

// Scott, 2026-10-04: "a way to hide daily routines … and show them", and
// "make sure the different types of items … are clearly differentiated".
describe('WeekV2 — the days’ own controls', () => {
  it('daily routines are hidden until shown, and the choice is remembered', () => {
    renderWeek()
    expect(renderDays).toHaveBeenLastCalledWith(expect.objectContaining({ dailyRoutines: false }))
    const group = within(screen.getByRole('group', { name: 'Daily routines' }))
    expect(group.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(group.getByRole('button', { name: 'Show' }))
    expect(renderDays).toHaveBeenLastCalledWith(expect.objectContaining({ dailyRoutines: true }))
    expect(localStorage.getItem('symphony-week-daily')).toBe('shown')
  })

  it('a key says which mark is which', () => {
    renderWeek()
    const key = within(screen.getByRole('list', { name: 'What the marks mean' }))
    expect(key.getByText(/Event/)).toBeInTheDocument()
    expect(key.getByText(/Task/)).toBeInTheDocument()
    expect(key.getByText(/Routine/)).toBeInTheDocument()
  })
})

// The week after planning (Scott, 2026-10-04: "the goal of this page should
// be to commit to items for the week"; mockup Planned.dc.html).
describe('WeekV2 — the planned week', () => {
  afterEach(() => { session.saved = null })

  it('says what was committed, and offers to change the plan', () => {
    session.saved = { at: new Date(2026, 9, 3), authorId: 'me', notes: { focus: 'the porch, before the rain' } }
    renderWeek()
    expect(screen.getByRole('region', { name: "This week's list" })).toHaveTextContent('Any day this week')
    expect(screen.getByText('Committed, no day of their own.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change the plan' })).toBeInTheDocument()
    expect(screen.getByText('the porch, before the rain')).toBeInTheDocument()
  })

  it('person buttons narrow the week to one person, the same lens as the top bar', () => {
    renderWeek()
    const who = within(screen.getByRole('group', { name: 'Whose week' }))
    expect(who.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('October lines can be ticked done, and show what the weeks did for them', () => {
    localStorage.setItem('symphony-week-ref', 'open')
    const line = task({ id: 'm1', title: 'Plan Thanksgiving', bucket: 'month', monthStart: new Date(2026, 9, 1) })
    const did = task({ id: 'w1', title: 'Book flights', bucket: 'week', weekStart: WEEK, sourceId: 'm1' })
    renderWeek([line, did])
    const ref = within(screen.getByRole('complementary', { name: 'October, for reference' }))
    expect(ref.getByRole('button', { name: 'Complete Plan Thanksgiving' })).toBeInTheDocument()
    expect(ref.getByText(/Book flights/)).toBeInTheDocument()
  })
})
