import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'

const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-10-3' }))
const auth = vi.hoisted(() => ({ user: { id: 'me' } as { id: string } | null }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: vi.fn(), updateTask: vi.fn(), pushTask: vi.fn(), updateTasksBulk: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), addTask: vi.fn() }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: vi.fn(), pushTask: vi.fn() }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ plan: null, loading: false, error: false }) }))

import { WeekV2 } from './WeekV2'
import { peekPaperWeekFocus, setPaperWeekFocus, __resetPaperImportStore } from '@/lib/paperPlan/importNextStore'

// 2026-10-08: "Continue planning" after a month's page was imported lands
// here — with the month beside the week, the imported lines marked, and
// "Add to this week" pointed at.
const WEEK = new Date(2026, 9, 3)
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 3, 12))
  __resetPaperImportStore()
  localStorage.clear()
  auth.user = { id: 'me' }
})
afterEach(() => { vi.useRealTimers() })

const line = (id: string, title: string) => ({ id, title, completed: false, createdAt: new Date(2026, 8, 30), assignedTo: 'me', bucket: 'month', monthStart: new Date(2026, 9, 1) }) as Task
const week = (tasks: Task[]) => (
  <MemoryRouter><WeekV2 tasks={tasks} weekStart={WEEK} meId="me" isCurrent renderDays={() => null} onSelectTask={vi.fn()} /></MemoryRouter>
)
const renderWeek = (tasks: Task[]) => render(week(tasks))

describe('WeekV2 — arriving from a paper import', () => {
  it('opens October beside the week, marks the imported lines and points at Add to this week — once', () => {
    setPaperWeekFocus('me', { monthStart: '2026-10-01', taskIds: ['p1'] })
    renderWeek([line('p1', 'Bring a picnic blanket'), line('o1', 'Plan Thanksgiving')])
    const ref = screen.getByRole('complementary', { name: 'October, for reference' })
    const hint = within(ref).getByRole('note')
    expect(hint).toHaveTextContent('From your page: choose what this week takes on — Add to this week on a line. It stays on October’s list either way.')
    expect(hint).toHaveFocus()
    const imported = within(ref).getByText('Bring a picnic blanket').closest('li')!
    expect(within(imported).getByText('From your page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Bring a picnic blanket to this week' })).toHaveAccessibleDescription(/From your page: choose what this week takes on/)
    expect(within(within(ref).getByText('Plan Thanksgiving').closest('li')!).queryByText('From your page')).toBeNull()
    // Used once, and the person's own reference preference is untouched.
    expect(peekPaperWeekFocus('me', ['2026-10-01'])).toBeNull()
    expect(localStorage.getItem('symphony-week-ref')).toBeNull()
  })

  it('without the pointer, the week is as it was: the month stays behind its link', () => {
    renderWeek([line('p1', 'Bring a picnic blanket')])
    expect(screen.queryByRole('complementary', { name: 'October, for reference' })).toBeNull()
    expect(screen.queryByText(/From your page/)).toBeNull()
  })

  // Friends-and-family review, 2026-10-08: the pointer had no account on it.
  it('a pointer another account left is not followed, and stays theirs', () => {
    setPaperWeekFocus('someone-else', { monthStart: '2026-10-01', taskIds: ['p1'] })
    renderWeek([line('p1', 'Bring a picnic blanket')])
    expect(screen.queryByRole('complementary', { name: 'October, for reference' })).toBeNull()
    expect(screen.queryByText(/From your page/)).toBeNull()
    expect(peekPaperWeekFocus('someone-else', ['2026-10-01'])).toMatchObject({ taskIds: ['p1'] })
  })

  it('is read once the signed-in person is known, and hidden when the tab changes accounts', () => {
    setPaperWeekFocus('me', { monthStart: '2026-10-01', taskIds: ['p1'] })
    auth.user = null
    const { rerender } = renderWeek([line('p1', 'Bring a picnic blanket')])
    expect(screen.queryByText(/From your page/)).toBeNull()
    // Signed out: nothing used up.
    expect(peekPaperWeekFocus('me', ['2026-10-01'])).not.toBeNull()

    auth.user = { id: 'me' }
    rerender(week([line('p1', 'Bring a picnic blanket')]))
    const ref = screen.getByRole('complementary', { name: 'October, for reference' })
    expect(within(ref).getByRole('note')).toHaveTextContent('From your page')
    expect(peekPaperWeekFocus('me', ['2026-10-01'])).toBeNull()

    auth.user = { id: 'someone-else' }
    rerender(week([line('p1', 'Bring a picnic blanket')]))
    expect(screen.queryByText(/From your page/)).toBeNull()
  })
})
