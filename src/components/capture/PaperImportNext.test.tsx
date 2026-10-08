import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { GuideState } from '@/lib/guide/guidedPlan'

const g = vi.hoisted(() => ({ state: null as GuideState | null, guideNext: vi.fn() }))
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => ({ state: g.state, loaded: true, savedIn: 'device', set: vi.fn() }) }))
vi.mock('@/components/guide/GuideBar', () => ({ useGuideNext: () => g.guideNext }))

import { PaperImportNext } from './PaperImportNext'
import { announcePaperImport, peekPaperWeekFocus, usePaperImport, __resetPaperImportStore } from '@/lib/paperPlan/importNextStore'
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
  return <p data-testid="still-saved">{usePaperImport() ? 'panel up' : 'panel gone'}</p>
}
const renderOn = (path = '/month?start=2026-10-01') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="*" element={<><PaperImportNext /><Where /><Saved /></>} /></Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 8, 10))
  __resetPaperImportStore(); g.state = null; g.guideNext.mockReset()
  localStorage.clear()
})
afterEach(() => { vi.useRealTimers() })

describe('PaperImportNext', () => {
  it('stays on the page after a save: names the period and count, with both actions as real buttons', () => {
    renderOn()
    expect(screen.queryByRole('status')).toBeNull()
    act(() => announcePaperImport(OCTOBER))
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
    act(() => announcePaperImport(OCTOBER))
    await user.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/week?start=2026-10-04')
    expect(screen.queryByRole('status')).toBeNull()
    expect(peekPaperWeekFocus(['2026-10-01'])).toMatchObject({ monthStart: '2026-10-01', taskIds: ['t1', 't2', 't3'] })
  })

  it('a season’s import continues to its month, with the season beside the list', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderOn('/season?start=2026-09-01')
    act(() => announcePaperImport({ ...OCTOBER, id: 'imp-2', altitude: 'season', periodStart: '2026-09-01', landings: [{ count: 3, label: 'on Fall’s list' }] }))
    expect(screen.getByRole('status')).toHaveTextContent('Your Fall list is saved — 3 items. Next, write October’s list, with Fall beside it.')
    await user.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/month?start=2026-10-01')
    expect(localStorage.getItem('symphony-plan-v2.view.month')).toBe('ref')
  })

  it('Done for now only dismisses — nothing moves', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderOn()
    act(() => announcePaperImport(OCTOBER))
    await user.click(screen.getByRole('button', { name: 'Done for now' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('still-saved')).toHaveTextContent('panel gone')
    expect(screen.getByTestId('where')).toHaveTextContent('/month?start=2026-10-01')
    expect(peekPaperWeekFocus(['2026-10-01'])).toBeNull()
  })

  it('works by keyboard: Tab from the panel reaches Continue planning, Enter follows it', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    renderOn()
    act(() => announcePaperImport(OCTOBER))
    await user.tab()
    expect(screen.getByRole('button', { name: 'Continue planning' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('where')).toHaveTextContent('/week?start=2026-10-04')
  })

  it('with a guided plan on this month, Continue moves the guide on instead of going around it', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    g.state = { v: 1, route: 'month', steps: ['month', 'week', 'today'], periods: { month: '2026-10-01', week: '2026-10-03', today: '2026-10-08' }, current: 0, done: [], status: 'active', updatedAt: '' }
    renderOn()
    act(() => announcePaperImport(OCTOBER))
    expect(screen.getByRole('status')).toHaveTextContent(/Next in your guided plan: week \d+\./)
    await user.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(g.guideNext).toHaveBeenCalledWith(g.state)
    expect(peekPaperWeekFocus(['2026-10-01'])).toMatchObject({ monthStart: '2026-10-01' })
  })

  it('with a guided plan on another step, Continue goes back to that step', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    g.state = { v: 1, route: 'bigger', steps: ['year', 'season', 'month', 'week', 'today'], periods: { year: '2026-01-01', season: '2026-09-01', month: '2026-10-01', week: '2026-10-03', today: '2026-10-08' }, current: 1, done: ['year'], status: 'active', updatedAt: '' }
    renderOn()
    act(() => announcePaperImport(OCTOBER))
    expect(screen.getByRole('status')).toHaveTextContent('Next, back to your guided plan:')
    await user.click(screen.getByRole('button', { name: 'Continue planning' }))
    expect(g.guideNext).not.toHaveBeenCalled()
    expect(screen.getByTestId('where')).toHaveTextContent('/season?start=2026-09-01')
  })

  it('two hosts on screen draw one panel', () => {
    render(<MemoryRouter><PaperImportNext /><PaperImportNext /></MemoryRouter>)
    act(() => announcePaperImport(OCTOBER))
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})
