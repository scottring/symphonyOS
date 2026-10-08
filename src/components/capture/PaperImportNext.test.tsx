import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { GuideState } from '@/lib/guide/guidedPlan'

const g = vi.hoisted(() => ({ state: null as GuideState | null, guideNext: vi.fn() }))
const auth = vi.hoisted(() => ({ user: { id: 'A' } as { id: string } | null }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }))
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => ({ state: g.state, loaded: true, savedIn: 'device', set: vi.fn() }) }))
vi.mock('@/components/guide/GuideBar', () => ({ useGuideNext: () => g.guideNext }))

import { PaperImportNext } from './PaperImportNext'
import { announcePaperImport, peekPaperWeekFocus, setPaperWeekFocus, usePaperImport, __resetPaperImportStore } from '@/lib/paperPlan/importNextStore'
import type { SavedImport } from '@/lib/paperPlan/importNext'

// Friends-and-family beta, 2026-10-08: after "Add 3 items" on the Month page
// the review closed on a brief toast and left no next step.

const OCTOBER: SavedImport = {
  id: 'imp-1', altitude: 'month', periodStart: '2026-10-01', names: { month: 'October', season: 'Fall', year: '2026' },
  saved: 3, linked: 0, failed: 0, landings: [{ count: 3, label: 'on October’s list' }], taskIds: ['t1', 't2', 't3'], at: Date.now(),
}

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}
function Saved() {
  return <p data-testid="still-saved">{usePaperImport(auth.user?.id) ? 'panel up' : 'panel gone'}</p>
}
const page = (path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="*" element={<><PaperImportNext /><Where /><Saved /></>} /></Routes>
  </MemoryRouter>
)
const renderOn = (path = '/month?start=2026-10-01') => render(page(path))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 8, 10))
  __resetPaperImportStore(); g.state = null; g.guideNext.mockReset(); auth.user = { id: 'A' }
  localStorage.clear()
})
afterEach(() => { vi.useRealTimers() })

describe('PaperImportNext', () => {
  it('stays on the page after a save: names the period and count, with both actions as real buttons', () => {
    renderOn()
    expect(screen.queryByRole('status')).toBeNull()
    act(() => announcePaperImport('A', OCTOBER))
    const panel = screen.getByRole('status')
    expect(panel).toHaveTextContent('Your October list is saved — 3 items. Next, choose what you want to work on this week.')
    expect(screen.getByRole('button', { name: 'Continue planning' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Done for now' })).toHaveAttribute('type', 'button')
    // It takes focus once, as the review closes, so the next Tab is Continue.
    expect(panel).toHaveFocus()
  })

  it('Continue planning goes to the week, and tells the week to open October beside it with the imported lines', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderOn()
    act(() => announcePaperImport('A', OCTOBER))
    await user.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/week?start=2026-10-04')
    expect(screen.queryByRole('status')).toBeNull()
    expect(peekPaperWeekFocus('A', ['2026-10-01'])).toMatchObject({ monthStart: '2026-10-01', taskIds: ['t1', 't2', 't3'] })
  })

  it('a season’s import continues to its month, with the season beside the list', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderOn('/season?start=2026-09-01')
    act(() => announcePaperImport('A', { ...OCTOBER, id: 'imp-2', altitude: 'season', periodStart: '2026-09-01', landings: [{ count: 3, label: 'on Fall’s list' }] }))
    expect(screen.getByRole('status')).toHaveTextContent('Your Fall list is saved — 3 items. Next, write October’s list, with Fall beside it.')
    await user.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/month?start=2026-10-01')
    expect(localStorage.getItem('symphony-plan-v2.view.month')).toBe('ref')
  })

  it('Done for now only dismisses — nothing moves', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderOn()
    act(() => announcePaperImport('A', OCTOBER))
    await user.click(screen.getByRole('button', { name: 'Done for now' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('still-saved')).toHaveTextContent('panel gone')
    expect(screen.getByTestId('where')).toHaveTextContent('/month?start=2026-10-01')
    expect(peekPaperWeekFocus('A', ['2026-10-01'])).toBeNull()
  })

  it('works by keyboard: Tab from the panel reaches Continue planning, Enter follows it', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderOn()
    act(() => announcePaperImport('A', OCTOBER))
    await user.tab()
    expect(screen.getByRole('button', { name: 'Continue planning' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('where')).toHaveTextContent('/week?start=2026-10-04')
  })

  it('with a guided plan on this month, Continue moves the guide on instead of going around it', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    g.state = { v: 1, route: 'month', steps: ['month', 'week', 'today'], periods: { month: '2026-10-01', week: '2026-10-03', today: '2026-10-08' }, current: 0, done: [], status: 'active', updatedAt: '' }
    renderOn()
    act(() => announcePaperImport('A', OCTOBER))
    expect(screen.getByRole('status')).toHaveTextContent(/Next in your guided plan: week \d+\./)
    await user.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(g.guideNext).toHaveBeenCalledWith(g.state)
    expect(peekPaperWeekFocus('A', ['2026-10-01'])).toMatchObject({ monthStart: '2026-10-01' })
  })

  it('with a guided plan on another step, Continue goes back to that step', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    g.state = { v: 1, route: 'bigger', steps: ['year', 'season', 'month', 'week', 'today'], periods: { year: '2026-01-01', season: '2026-09-01', month: '2026-10-01', week: '2026-10-03', today: '2026-10-08' }, current: 1, done: ['year'], status: 'active', updatedAt: '' }
    renderOn()
    act(() => announcePaperImport('A', OCTOBER))
    expect(screen.getByRole('status')).toHaveTextContent('Next, back to your guided plan:')
    await user.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(g.guideNext).not.toHaveBeenCalled()
    expect(screen.getByTestId('where')).toHaveTextContent('/season?start=2026-09-01')
  })

  it('two hosts on screen draw one panel', () => {
    render(<MemoryRouter><PaperImportNext /><PaperImportNext /></MemoryRouter>)
    act(() => announcePaperImport('A', OCTOBER))
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  // Friends-and-family review, 2026-10-08: signing out of A and into B in the
  // same tab showed A's import and steered B's guided plan with it.
  it('belongs to the account that saved it: A → B → signed out → A', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { rerender } = renderOn()
    act(() => announcePaperImport('A', OCTOBER))
    expect(screen.getByRole('status')).toHaveTextContent('Your October list is saved')

    // B signs in, with a guided plan of their own on this month: nothing of
    // A's is shown, and nothing can steer B's guide or week.
    auth.user = { id: 'B' }
    g.state = { v: 1, route: 'month', steps: ['month', 'week', 'today'], periods: { month: '2026-10-01', week: '2026-10-03', today: '2026-10-08' }, current: 0, done: [], status: 'active', updatedAt: '' }
    rerender(page('/month?start=2026-10-01'))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue planning' })).toBeNull()
    expect(screen.getByTestId('still-saved')).toHaveTextContent('panel gone')

    auth.user = null
    rerender(page('/month?start=2026-10-01'))
    expect(screen.queryByRole('status')).toBeNull()
    expect(g.guideNext).not.toHaveBeenCalled()
    expect(peekPaperWeekFocus('B', ['2026-10-01'])).toBeNull()

    // A comes back to the same tab: still unanswered, still theirs.
    auth.user = { id: 'A' }
    g.state = null
    rerender(page('/month?start=2026-10-01'))
    expect(screen.getByRole('status')).toHaveTextContent('Your October list is saved')
    await user.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(peekPaperWeekFocus('A', ['2026-10-01'])).toMatchObject({ taskIds: ['t1', 't2', 't3'] })
    expect(peekPaperWeekFocus('B', ['2026-10-01'])).toBeNull()
  })

  it('an import that finishes after the tab changed accounts shows only to the account that started it', () => {
    auth.user = { id: 'B' }
    const { rerender } = renderOn()
    // A's save completes while B is signed in.
    act(() => announcePaperImport('A', OCTOBER))
    expect(screen.queryByRole('status')).toBeNull()
    auth.user = { id: 'A' }
    rerender(page('/month?start=2026-10-01'))
    expect(screen.getByRole('status')).toHaveTextContent('Your October list is saved')
  })

  it('a week pointer A left is not B’s to follow', () => {
    act(() => setPaperWeekFocus('A', { monthStart: '2026-10-01', taskIds: ['t1'] }))
    expect(peekPaperWeekFocus('B', ['2026-10-01'])).toBeNull()
    expect(peekPaperWeekFocus(null, ['2026-10-01'])).toBeNull()
    expect(peekPaperWeekFocus('A', ['2026-10-01'])).toMatchObject({ taskIds: ['t1'] })
  })

  it('after a reload, the panel comes back for A only — B and signed out see nothing', async () => {
    act(() => announcePaperImport('A', OCTOBER))
    vi.resetModules()
    const { PaperImportNext: Reloaded } = await import('./PaperImportNext')
    const reloaded = () => <MemoryRouter initialEntries={['/month?start=2026-10-01']}><Reloaded /></MemoryRouter>

    auth.user = { id: 'B' }
    const { rerender } = render(reloaded())
    expect(screen.queryByRole('status')).toBeNull()
    auth.user = null
    rerender(reloaded())
    expect(screen.queryByRole('status')).toBeNull()
    auth.user = { id: 'A' }
    rerender(reloaded())
    const panel = screen.getByRole('status')
    expect(panel).toHaveTextContent('Your October list is saved — 3 items.')
    // Restored, not just announced: it does not take focus.
    expect(panel).not.toHaveFocus()
  })
})
