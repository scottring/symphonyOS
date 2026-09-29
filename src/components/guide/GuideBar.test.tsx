import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import type { GuideState } from '@/lib/guide/guidedPlan'

const guide = { state: null as GuideState | null, loaded: true, savedIn: 'account' as const, set: vi.fn(async (s: GuideState | null) => { guide.state = s }) }
vi.mock('@/hooks/useGuidedPlan', () => ({ useGuidedPlan: () => guide }))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }
const sessionArgs: [string, string][] = []
vi.mock('@/hooks/usePlanningSession', async () => {
  const real = await vi.importActual<typeof import('@/hooks/usePlanningSession')>('@/hooks/usePlanningSession')
  return { ...real, usePlanningSession: (h: string, t: string) => { sessionArgs.push([h, t]); return session } }
})
const toast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ showToast: (...a: unknown[]) => toast(...a) }))

import { GuideBar } from './GuideBar'

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}</p> }
const show = (at: string) => render(
  <MemoryRouter initialEntries={[at]}><GuideBar /><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter>,
)
const monthRun = (): GuideState => ({ v: 1, route: 'month', steps: ['month', 'week', 'today'], periods: { month: '2026-10-01', week: '2026-09-26', today: '2026-09-29' }, current: 0, done: [], status: 'active', updatedAt: '' })

describe('GuideBar', () => {
  beforeEach(() => { guide.state = null; guide.set.mockClear(); session.save.mockReset(); toast.mockReset(); sessionArgs.length = 0 })

  it('shows nothing without a run', () => {
    show('/month')
    expect(screen.queryByRole('region', { name: 'Guided planning' })).toBeNull()
  })

  it('on the step’s page: the step, one question, and Save-and-continue that agrees October and moves to week 40', async () => {
    guide.state = monthRun()
    session.save.mockResolvedValue(true)
    show('/month?start=2026-10-01')
    expect(screen.getByText(/Step 1 of 3 · October 2026/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'What do you want to move forward this month?' })).toBeTruthy()
    expect(sessionArgs.at(-1)).toEqual(['monthly', '2026-10'])
    fireEvent.click(screen.getByRole('button', { name: 'Save October and continue' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/week?start=2026-09-26'))
    expect(session.save).toHaveBeenCalled()
    expect(guide.set).toHaveBeenLastCalledWith(expect.objectContaining({ current: 1, done: ['month'] }))
  })

  it('a failed save says so and does not move on', async () => {
    guide.state = monthRun()
    session.save.mockResolvedValue(false)
    show('/month?start=2026-10-01')
    fireEvent.click(screen.getByRole('button', { name: 'Save October and continue' }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Couldn’t save the October plan/), 'error', 6000))
    expect(guide.set).not.toHaveBeenCalled()
    expect(screen.getByTestId('where').textContent).toBe('/month?start=2026-10-01')
  })

  it('elsewhere, it offers the way back to the step', () => {
    guide.state = monthRun()
    show('/inbox')
    fireEvent.click(screen.getByRole('button', { name: 'Go to October' }))
    expect(screen.getByTestId('where').textContent).toBe('/month?start=2026-10-01')
  })

  it('Save and leave pauses and goes to Today, where one line offers Resume', async () => {
    guide.state = monthRun()
    const view = show('/month?start=2026-10-01')
    fireEvent.click(screen.getByRole('button', { name: 'Save and leave' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/today'))
    expect(guide.state?.status).toBe('paused')
    view.unmount()
    show('/today')
    expect(screen.getByText(/Guided planning paused at/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
  })

  it('the last step (Today) finishes without writing a plan record', async () => {
    guide.state = { ...monthRun(), current: 2, done: ['month', 'week'] }
    show('/today')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/start?done=1'))
    expect(session.save).not.toHaveBeenCalled()
    expect(guide.state?.status).toBe('finished')
  })
})
