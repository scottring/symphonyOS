import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'

const session = { saved: null as null | { at: Date; authorId: string; notes: { focus?: string } }, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-10-3' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: vi.fn(), updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), addTask: vi.fn() }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: vi.fn(), pushTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [{ id: 'sk', name: 'Scott', initials: 'SK', color: 'blue' }] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn(), skip: vi.fn(), undoDone: vi.fn(), getInstancesForRange: vi.fn(async () => []) }) }))
vi.mock('@/components/home/week/useWeekInstances', () => ({ useWeekInstances: () => [] }))
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => ({ activeRoutines: [] }) }))
vi.mock('@/hooks/useDomain', () => {
  const lens = { layers: new Set(['family', 'personal', 'work', 'unsorted']) }
  return { useDomain: () => lens, useDomainOptional: () => lens }
})
vi.mock('@/hooks/useDiscussionInbox', () => ({ useDiscussionInbox: () => ({ rows: [], unreadCount: 0, loading: false, reload: vi.fn() }) }))
vi.mock('@/hooks/useDayLoadEvents', () => ({ useDayLoadEvents: () => ({ events: [], available: true, loading: false, range: null, failed: false }) }))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ plan: null, loading: false, error: false }) }))

import { WeekV2 } from './WeekV2'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 3, 12)); session.saved = null })
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const month = { completed: false, createdAt: new Date(2026, 8, 1), assignedTo: 'me', id: 'o1', title: 'Plan Thanksgiving', bucket: 'month', monthStart: new Date(2026, 9, 1) } as Task
const inbox = { completed: false, createdAt: new Date(2026, 9, 1), id: 'c1', title: 'Call the dentist', bucket: 'inbox' } as Task
const renderWeek = () => {
  const renderDays = vi.fn((o: Record<string, unknown>) => <p data-testid="days">{JSON.stringify({ ...o, members: undefined })}</p>)
  render(<MemoryRouter><WeekV2 tasks={[month, inbox]} weekStart={new Date(2026, 9, 3)} meId="me" isCurrent renderDays={renderDays} onSelectTask={vi.fn()} /></MemoryRouter>)
  return renderDays
}
const startSession = () => act(() => { window.dispatchEvent(new Event('pv2:plan-week')) })
const goTo = (label: string) => fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.endsWith(label) && b.closest('.pv2-steps'))!)

// Scott, 2026-10-03: "present it stepwise, in an organized way" — one kind of
// thing at a time, the week filling up beside it.
describe('WeekV2 — planning in steps', () => {
  it('with nothing to look back on, opens on the Inbox, the week beside it', () => {
    const renderDays = renderWeek()
    startSession()
    const bar = within(screen.getByRole('region', { name: /Planning week/ }))
    expect(bar.getAllByRole('button', { name: /^\d/ }).map((b) => b.textContent)).toEqual(['1Inbox', '2Between us', '3Can’t move', '4Look ahead', '5Routines', '6Write the week', '7The week'])
    expect(screen.getByRole('region', { name: 'Inbox' })).toHaveTextContent('Call the dentist')
    expect(renderDays).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'strip' }))
  })

  it('Can’t move: the days alone, only what’s fixed', () => {
    const renderDays = renderWeek()
    startSession()
    goTo('Can’t move')
    expect(renderDays).toHaveBeenLastCalledWith(expect.objectContaining({ show: 'fixed' }))
  })

  // Scott, 2026-10-04: "the actual actions are on week and day" — write the
  // week, with the month beside it for reference.
  it('Write the week: the week’s list, the month beside it', () => {
    renderWeek()
    startSession()
    goTo('Write the week')
    expect(screen.getByRole('region', { name: 'This week\'s list' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /October/ })).toHaveTextContent('Plan Thanksgiving')
  })

  it('one primary at a time: Next on every step, Mark planned only on the last', () => {
    renderWeek()
    startSession()
    const bar = () => within(screen.getByRole('region', { name: /Planning week/ }))
    expect(bar().queryByRole('button', { name: /^Mark week \d+ planned$/ })).toBeNull()
    expect(bar().getByRole('button', { name: /^Next: Between us/ })).toBeInTheDocument()
    goTo('The week')
    expect(bar().getByRole('button', { name: /^Mark week \d+ planned$/ })).toBeInTheDocument()
    expect(bar().queryByRole('button', { name: /^Next:/ })).toBeNull()
  })

  it('The week: what it’s for, whose week, and each day’s shape — saved with the plan', async () => {
    session.save.mockResolvedValue(true)
    const renderDays = renderWeek()
    startSession()
    goTo('The week')
    expect(renderDays).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'shape', person: 'all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scott' }))
    expect(renderDays).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'shape', person: 'sk' }))
    fireEvent.change(screen.getByLabelText('This week is for…'), { target: { value: 'Keep Monday light' } })
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /^Mark week \d+ planned$/ }).at(-1)!) })
    expect(session.save).toHaveBeenCalledWith(expect.objectContaining({ focus: 'Keep Monday light' }))
  })

  it('Leave for now brings the page back as it was, with the week’s line once planned', () => {
    session.saved = { at: new Date(2026, 9, 3), authorId: 'me', notes: { focus: 'Keep Monday light' } }
    const renderDays = renderWeek()
    expect(screen.getByText('Keep Monday light')).toBeInTheDocument()
    startSession()
    fireEvent.click(screen.getByRole('button', { name: 'Leave for now' }))
    expect(screen.queryByRole('region', { name: /Planning week/ })).toBeNull()
    expect(renderDays).toHaveBeenLastCalledWith(expect.objectContaining({ dailyRoutines: false }))
  })
})
