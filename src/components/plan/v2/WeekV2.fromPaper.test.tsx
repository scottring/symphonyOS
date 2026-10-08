import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'

const session = { saved: null, mine: null, loading: false, loadedToken: '', error: null, reload: vi.fn(), save: vi.fn() }
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => session, weekToken: () => '2026-10-3' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
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
})
afterEach(() => { vi.useRealTimers() })

const line = (id: string, title: string) => ({ id, title, completed: false, createdAt: new Date(2026, 8, 30), assignedTo: 'me', bucket: 'month', monthStart: new Date(2026, 9, 1) }) as Task
const renderWeek = (tasks: Task[]) => render(
  <MemoryRouter><WeekV2 tasks={tasks} weekStart={WEEK} meId="me" isCurrent renderDays={() => null} onSelectTask={vi.fn()} /></MemoryRouter>,
)

describe('WeekV2 — arriving from a paper import', () => {
  it('opens October beside the week, marks the imported lines and points at Add to this week — once', () => {
    setPaperWeekFocus({ monthStart: '2026-10-01', taskIds: ['p1'] })
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
    expect(peekPaperWeekFocus(['2026-10-01'])).toBeNull()
    expect(localStorage.getItem('symphony-week-ref')).toBeNull()
  })

  it('without the pointer, the week is as it was: the month stays behind its link', () => {
    renderWeek([line('p1', 'Bring a picnic blanket')])
    expect(screen.queryByRole('complementary', { name: 'October, for reference' })).toBeNull()
    expect(screen.queryByText(/From your page/)).toBeNull()
  })
})
