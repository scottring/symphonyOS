import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
vi.mock('./WeekStepScreen', () => ({ WeekStepMain: () => null }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ plan: null, loading: false, error: false }) }))

import { WeekV2 } from './WeekV2'
import { PlanMastheadSlotsContext } from './planMastheadSlots'

// A fixed Tuesday: the week's own last day changes what the toolbar offers
// (it hands to next week), so these tests must not ride the wall clock.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 29, 12)) })
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const renderWeek = () => render(
  <MemoryRouter>
    <WeekV2 tasks={[]} weekStart={new Date(2026, 8, 27)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} />
  </MemoryRouter>,
)

// 2026-10-04: one verb, "Plan the week", opens the session in steps (the
// look-back its first step when last week left open work); marking planned
// is the session's last step.
const toLastStep = () => fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.endsWith('The week') && b.closest('.pv2-steps'))!)
describe('WeekV2 toolbar — one verb', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; session.save.mockReset() })

  it('an unplanned week offers “Plan the week”, which opens the steps', () => {
    renderWeek()
    expect(screen.getByText(/Week \d+ isn’t planned yet/)).toBeTruthy()
    const plan = screen.getByRole('button', { name: 'Plan the week' })
    expect(plan.className).toBe('pv2-btn')
    expect(screen.queryByRole('button', { name: /^Mark week \d+ planned$/ })).toBeNull()
    fireEvent.click(plan)
    expect(screen.getByRole('region', { name: /Planning week \d+/ })).toBeTruthy()
  })

  it('saving leaves its own line with the next step — Today for this week', async () => {
    session.save.mockResolvedValue(true)
    renderWeek()
    fireEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
    toLastStep()
    fireEvent.click(screen.getByRole('button', { name: /^Mark week \d+ planned$/ }))
    expect(await screen.findByRole('button', { name: 'Not now' })).toBeTruthy()
    expect(screen.getByText(/Week \d+ is planned\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pick something for today →' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull()
  })

  it('a week planned ahead hands back to Today, not a dead end (#23)', async () => {
    session.save.mockResolvedValue(true)
    render(<MemoryRouter><WeekV2 tasks={[]} weekStart={new Date(2026, 9, 3)} meId="me" isCurrent={false} days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
    toLastStep()
    fireEvent.click(screen.getByRole('button', { name: /^Mark week \d+ planned$/ }))
    expect(await screen.findByRole('button', { name: 'Back to Today →' })).toBeTruthy()
  })

  it('a planned week can be changed, quietly', () => {
    session.saved = { authorId: 'me', at: new Date(2026, 8, 27) }
    renderWeek()
    expect(screen.getByRole('button', { name: 'Change the plan' }).className).toBe('pv2-qbtn')
  })
})

// Layout system 2026-10-01: on desktop the control row folds into the week's
// masthead (HomeHeader's hosts); without hosts (phones) the row stays.
describe('WeekV2 toolbar — folded into the masthead', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null })
  it('portals the status and the controls into the masthead hosts, with no row of its own', () => {
    const subline = document.createElement('div')
    const controls = document.createElement('div')
    document.body.append(subline, controls)
    const { container } = render(
      <MemoryRouter>
        <PlanMastheadSlotsContext.Provider value={{ subline, controls }}>
          <WeekV2 tasks={[]} weekStart={new Date(2026, 8, 27)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} />
        </PlanMastheadSlotsContext.Provider>
      </MemoryRouter>,
    )
    expect(container.querySelector('.pv2-toolbar')).toBeNull()
    expect(subline.textContent).toMatch(/Week \d+ isn’t planned yet/)
    expect(within(controls).getByRole('button', { name: 'Plan the week' })).toBeTruthy()
    expect(within(controls).queryByRole('group', { name: 'View' })).toBeNull()
    subline.remove(); controls.remove()
  })
})

// 2026-09-29 (beta walkthrough): Sat Sep 26 – Fri Oct 2 showed only September,
// all done, and hid October's open goals.
describe('WeekV2 reference — a week across a month end shows both months', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null })
  const goal = (id: string, title: string, month: Date, completed = false) => ({
    id, title, completed, isGoal: true, bucket: 'month', monthStart: month, createdAt: new Date(2026, 8, 29), assignedTo: 'me',
  }) as unknown as import('@/types/task').Task

  it('lists September and October, each whole: done lines stay, struck', () => {
    const tasks = [goal('s1', 'Finish the garden', new Date(2026, 8, 1), true), goal('o1', 'Book flu shots', new Date(2026, 9, 1))]
    render(<MemoryRouter><WeekV2 tasks={tasks} weekStart={new Date(2026, 8, 26)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /September and October list/ }))
    expect(screen.getByRole('button', { name: 'Finish the garden' }).closest('li')?.dataset.done).toBe('true')
    expect(screen.getByRole('button', { name: 'Book flu shots' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open October →' })).toBeTruthy()
  })

  it('the empty list asks for the week’s own work, not a review to start', () => {
    render(<MemoryRouter><WeekV2 tasks={[]} weekStart={new Date(2026, 8, 26)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    expect(screen.queryByText(/start the weekly review/)).toBeNull()
    expect(screen.getByText('Nothing on this week yet. Add the first thing below.')).toBeTruthy()
  })

  it('a week inside one month shows one month', () => {
    render(<MemoryRouter><WeekV2 tasks={[]} weekStart={new Date(2026, 9, 3)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^October list/ }))
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
    fireEvent.click(screen.getByRole('button', { name: /September and October list/ }))
    expect(screen.getAllByText('Loading…').length).toBe(2)
    expect(screen.queryByText(/Nothing written for/)).toBeNull()
    vi.doUnmock('@/hooks/useSupabaseTasks')
  })
})

// Walkthrough 2026-09-30: nothing said a month line had come into the week.
// 2026-10-04: the month stays whole; a line that is on the week says so.
describe('WeekV2 — a month line on this week says so', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; localStorage.clear() })
  it('marks it “On this week”, and offers no second copy', () => {
    const line = { id: 'g1', title: 'Hang porch plants', completed: false, bucket: 'week', monthStart: new Date(2026, 9, 1), weekStart: new Date(2026, 9, 3), createdAt: new Date(2026, 8, 29), assignedTo: 'me',
      commitments: [{ level: 'month', periodStart: new Date(2026, 9, 1), status: 'open' }, { level: 'week', periodStart: new Date(2026, 9, 3), status: 'open' }] }
    render(<MemoryRouter><WeekV2 tasks={[line] as never} weekStart={new Date(2026, 9, 3)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^October list/ }))
    const ref = within(screen.getByRole('complementary', { name: 'October, for reference' }))
    expect(ref.getByText('On this week')).toBeTruthy()
    expect(ref.queryByRole('button', { name: /Add Hang porch plants to this week/ })).toBeNull()
  })
})
