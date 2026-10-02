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
vi.mock('./RefShelves', () => ({ WeekRefShelves: () => null }))

import { WeekV2 } from './WeekV2'
import { PlanMastheadSlotsContext } from './planMastheadSlots'

// A fixed Tuesday: the week's own last day changes what the toolbar offers
// (it hands to next week), so these tests must not ride the wall clock.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 29, 12)) })
afterEach(() => { vi.useRealTimers() })

const renderWeek = () => render(
  <MemoryRouter>
    <WeekV2 tasks={[]} weekStart={new Date(2026, 8, 27)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} />
  </MemoryRouter>,
)

// Walkthrough 2026-10-02 (#7, #9, #22): "Plan week N" opened the same page
// under a white bar when there was nothing to look back on. Now the one verb
// is "Mark week N planned" in place, unless last week left open work — then
// "Look back at last week" opens the look-back.
describe('WeekV2 toolbar — one verb', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null; session.save.mockReset() })

  it('an unplanned week with nothing to look back on is marked planned in one tap', async () => {
    session.save.mockResolvedValue(true)
    renderWeek()
    expect(screen.getByText(/Week \d+ isn’t planned yet/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Plan week \d+$/ })).toBeNull()
    const mark = screen.getByRole('button', { name: /^Mark week \d+ planned$/ })
    expect(mark.className).toBe('pv2-btn')
    fireEvent.click(mark)
    expect(session.save).toHaveBeenCalled()
    // No planning screen opened: no "Planning week N" bar.
    expect(screen.queryByRole('region', { name: /Planning week \d+/ })).toBeNull()
  })

  it('an agreed week shows its status and no verb', () => {
    session.saved = { authorId: 'me', at: new Date(2026, 8, 26) }
    renderWeek()
    expect(screen.getByText(/Week \d+ planned/)).toBeTruthy()
    // "· you" read as a stray word.
    expect(screen.queryByText(/· you/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Mark week \d+ planned$/ })).toBeNull()
  })

  it('no "no plan" claim while the session is still loading', () => {
    session.loading = true
    renderWeek()
    expect(screen.queryByText(/Week \d+ isn’t planned yet/)).toBeNull()
  })

  it('a failed read says so, offers Try again, and offers no save that would overwrite', () => {
    session.error = 'network'
    renderWeek()
    expect(screen.queryByText(/Week \d+ isn’t planned yet/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(session.reload).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /^Mark week \d+ planned$/ })).toBeNull()
  })

  it('saving leaves its own line with the next step — Today for this week', async () => {
    session.save.mockResolvedValue(true)
    renderWeek()
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
    fireEvent.click(screen.getByRole('button', { name: /^Mark week \d+ planned$/ }))
    expect(await screen.findByRole('button', { name: 'Back to Today →' })).toBeTruthy()
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
    expect(within(controls).getByRole('button', { name: /^Mark week \d+ planned$/ })).toBeTruthy()
    expect(within(controls).getByRole('group', { name: 'View' })).toBeTruthy()
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

  it('lists September and October, each with its own open items', () => {
    const tasks = [goal('s1', 'Finish the garden', new Date(2026, 8, 1), true), goal('o1', 'Book flu shots', new Date(2026, 9, 1))]
    render(<MemoryRouter><WeekV2 tasks={tasks} weekStart={new Date(2026, 8, 26)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^With / }))
    expect(screen.getByText('Nothing open on September’s plan.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Book flu shots' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open October →' })).toBeTruthy()
  })

  it('the empty list points at the months beside it, not at a review to start', () => {
    render(<MemoryRouter><WeekV2 tasks={[]} weekStart={new Date(2026, 8, 26)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^With / }))
    expect(screen.queryByText(/start the weekly review/)).toBeNull()
    expect(screen.getByText(/take a step from September and October’s plan beside it/)).toBeTruthy()
  })

  it('a week inside one month shows one month', () => {
    render(<MemoryRouter><WeekV2 tasks={[]} weekStart={new Date(2026, 9, 3)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^With / }))
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
    fireEvent.click(screen.getByRole('button', { name: /^With / }))
    expect(screen.getAllByText('Loading…').length).toBe(2)
    expect(screen.queryByText(/Nothing open on/)).toBeNull()
    vi.doUnmock('@/hooks/useSupabaseTasks')
  })
})

// Walkthrough 2026-09-30: nothing said "Hang porch plants" had a step this week.
// 2026-10-02: in words, not a count.
describe('WeekV2 — a month goal says this week took it on', () => {
  beforeEach(() => { session.saved = null; session.loading = false; session.error = null })
  it('marks the goal a week step serves', () => {
    const goal = { id: 'g1', title: 'Hang porch plants', completed: false, isGoal: true, bucket: 'month', monthStart: new Date(2026, 9, 1), createdAt: new Date(2026, 8, 29), assignedTo: 'me' }
    const step = { id: 's1', title: 'Buy porch plant hooks', completed: false, bucket: 'week', weekStart: new Date(2026, 8, 26), goalTaskId: 'g1', createdAt: new Date(2026, 8, 30), assignedTo: 'me' }
    render(<MemoryRouter><WeekV2 tasks={[goal, step] as never} weekStart={new Date(2026, 8, 26)} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^With / }))
    expect(screen.getByText('In this week’s list')).toBeTruthy()
  })
})
