import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'

const h = vi.hoisted(() => ({ dayPlan: null as null | { unfinished: unknown[] } }))
const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-10-3' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: vi.fn(), updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), addTask: vi.fn() }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: vi.fn(), pushTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ plan: h.dayPlan, loading: false, error: false }) }))

import { WeekV2 } from './WeekV2'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 3, 12)); h.dayPlan = null })
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const month = { completed: false, createdAt: new Date(2026, 8, 1), assignedTo: 'me', id: 'o1', title: 'Plan Thanksgiving', bucket: 'month', monthStart: new Date(2026, 9, 1) } as Task
const renderWeek = () => {
  const renderDays = vi.fn((o: { show?: string; routinesOpen?: boolean; readOnly?: boolean }) => <p data-testid="days">{JSON.stringify(o)}</p>)
  render(<MemoryRouter><WeekV2 tasks={[month]} weekStart={new Date(2026, 9, 3)} meId="me" isCurrent renderDays={renderDays} onSelectTask={vi.fn()} /></MemoryRouter>)
  return renderDays
}
const startSession = () => {
  // Nothing to look back on: the one verb is "Mark planned"; the session opens from the page's event.
  act(() => { window.dispatchEvent(new Event('pv2:plan-week')) })
}

// Scott, 2026-10-03: planning "more obviously sequential" — look back, the
// fixed points, fill the week, the finished plan.
describe('WeekV2 — planning in steps', () => {
  it('with nothing to look back on, the session opens on Fixed points: the days alone, fixed only', () => {
    const renderDays = renderWeek()
    startSession()
    const bar = within(screen.getByRole('region', { name: /Planning week/ }))
    expect(bar.getAllByRole('button', { name: /^\d/ }).map((b) => b.textContent)).toEqual(['1Fixed points', '2Fill the week', '3The plan'])
    expect(renderDays).toHaveBeenLastCalledWith({ show: 'fixed' })
    expect(screen.queryByRole('complementary', { name: /October/ })).toBeNull()
  })

  it('Next: Fill the week — October and the list on top, the days with routines open', () => {
    const renderDays = renderWeek()
    startSession()
    fireEvent.click(screen.getByRole('button', { name: 'Next: Fill the week →' }))
    expect(screen.getByRole('complementary', { name: /October/ })).toBeInTheDocument()
    expect(renderDays).toHaveBeenLastCalledWith({ routinesOpen: true })
  })

  it('The plan: the days alone, read-only', () => {
    const renderDays = renderWeek()
    startSession()
    fireEvent.click(screen.getByRole('button', { name: '3 The plan' }))
    expect(renderDays).toHaveBeenLastCalledWith({ readOnly: true })
    expect(screen.queryByRole('complementary', { name: /October/ })).toBeNull()
  })

  it('Leave for now brings the page back as it was', () => {
    const renderDays = renderWeek()
    startSession()
    fireEvent.click(screen.getByRole('button', { name: 'Leave for now' }))
    expect(screen.queryByRole('region', { name: /Planning week/ })).toBeNull()
    expect(renderDays).toHaveBeenLastCalledWith({})
  })
})
