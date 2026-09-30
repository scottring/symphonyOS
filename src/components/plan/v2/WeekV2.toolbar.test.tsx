import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const session = { saved: null as null | { authorId: string; at: Date }, mine: null, loading: false, loadedToken: '', error: null as null | string, reload: vi.fn(), save: vi.fn() }

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-9-27' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: vi.fn(), updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), addTask: vi.fn() }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: vi.fn(), pushTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('./RefShelves', () => ({ WeekRefShelves: () => null }))

import { WeekV2 } from './WeekV2'

const renderWeek = () => render(
  <MemoryRouter>
    <WeekV2 tasks={[]} weekStart={new Date(2026, 8, 27)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} />
  </MemoryRouter>,
)

describe('WeekV2 toolbar — one "Plan week N" action', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; session.save.mockReset() })

  it('an unplanned week says so, and its one Plan button is prominent and opens planning', () => {
    renderWeek()
    expect(screen.getByText(/Week \d+ isn’t planned yet/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Weekly review' })).toBeNull()
    const plan = screen.getByRole('button', { name: /^Plan week \d+$/ })
    expect(plan.className).toBe('pv2-btn')
    fireEvent.click(plan)
    expect(screen.getByRole('region', { name: /Planning week \d+/ })).toBeTruthy()
  })

  it('an agreed week shows its status and a quiet Plan button', () => {
    session.saved = { authorId: 'me', at: new Date(2026, 8, 26) }
    renderWeek()
    expect(screen.getByText(/Week \d+ planned/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Plan week \d+$/ }).className).toBe('pv2-qbtn')
  })

  it('no "no plan" claim while the session is still loading', () => {
    session.loading = true
    renderWeek()
    expect(screen.queryByText(/Week \d+ isn’t planned yet/)).toBeNull()
  })

  it('a failed read says so, offers Try again, and cannot start a save that would overwrite', () => {
    session.error = 'network'
    renderWeek()
    expect(screen.queryByText(/Week \d+ isn’t planned yet/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(session.reload).toHaveBeenCalled()
    expect((screen.getByRole('button', { name: /^Plan week \d+$/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('saving leaves a line with what was saved and the next step — Today for this week', async () => {
    session.save.mockResolvedValue(true)
    renderWeek()
    fireEvent.click(screen.getByRole('button', { name: /^Plan week \d+$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Mark week \d+ planned$/ }))
    expect(await screen.findByRole('button', { name: 'Done for now' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pick something for today' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done for now' }))
    expect(screen.queryByRole('button', { name: 'Done for now' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Plan week \d+$/ })).toBeTruthy()
  })
})

// 2026-09-29 (beta walkthrough): Sat Sep 26 – Fri Oct 2 showed only September,
// all done, and hid October's open goals.
describe('WeekV2 reference — a week across a month end shows both months', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null })
  const goal = (id: string, title: string, month: Date, completed = false) => ({
    id, title, completed, isGoal: true, bucket: 'month', monthStart: month, createdAt: new Date(2026, 8, 29), assignedTo: 'me',
  }) as unknown as import('@/types/task').Task

  it('lists September and October, each with its own open items', () => {
    const tasks = [goal('s1', 'Finish the garden', new Date(2026, 8, 1), true), goal('o1', 'Book flu shots', new Date(2026, 9, 1))]
    render(<MemoryRouter><WeekV2 tasks={tasks} weekStart={new Date(2026, 8, 26)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^Plan week \d+$/ }))
    expect(screen.getByText('Nothing open on September’s plan.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Book flu shots' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open October →' })).toBeTruthy()
  })

  it('in an open review the empty list does not ask to start the review', () => {
    render(<MemoryRouter><WeekV2 tasks={[]} weekStart={new Date(2026, 8, 26)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^Plan week \d+$/ }))
    expect(screen.queryByText(/start the weekly review/)).toBeNull()
    expect(screen.getAllByText(/Choose next steps from September and October’s plan/).length).toBeGreaterThan(0)
  })

  it('a week inside one month shows one month', () => {
    render(<MemoryRouter><WeekV2 tasks={[]} weekStart={new Date(2026, 9, 3)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^Plan week \d+$/ }))
    expect(screen.getByRole('button', { name: 'Open October →' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open September →' })).toBeNull()
  })
})

// Walkthrough 2026-09-29: during the first seconds the reference said
// "Nothing open on October's plan" over twelve goals still loading.
describe('WeekV2 reference while tasks load', () => {
  it('says Loading, not Nothing open', async () => {
    vi.resetModules()
    vi.doMock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ loading: true, toggleTask: vi.fn(), updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), addTask: vi.fn() }) }))
    const { WeekV2: Fresh } = await import('./WeekV2')
    render(<MemoryRouter><Fresh tasks={[]} weekStart={new Date(2026, 8, 26)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^Plan week \d+$/ }))
    expect(screen.getAllByText('Loading…').length).toBe(2)
    expect(screen.queryByText(/Nothing open on/)).toBeNull()
    vi.doUnmock('@/hooks/useSupabaseTasks')
  })
})

// Walkthrough 2026-09-30: nothing said "Hang porch plants" had a step this week.
describe('WeekV2 — a month goal says how many steps this week serve it', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null })
  it('counts the week’s steps under their goal', () => {
    const goal = { id: 'g1', title: 'Hang porch plants', completed: false, isGoal: true, bucket: 'month', monthStart: new Date(2026, 9, 1), createdAt: new Date(2026, 8, 29), assignedTo: 'me' }
    const step = { id: 's1', title: 'Buy porch plant hooks', completed: false, bucket: 'week', weekStart: new Date(2026, 8, 26), goalTaskId: 'g1', createdAt: new Date(2026, 8, 30), assignedTo: 'me' }
    render(<MemoryRouter><WeekV2 tasks={[goal, step] as never} weekStart={new Date(2026, 8, 26)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^Plan week \d+$/ }))
    expect(screen.getByText('1 step this week')).toBeTruthy()
  })
})
