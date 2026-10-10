import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ASSIGNEE_FILTER_KEY } from '@/hooks/useAssigneeFilter'

vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => ({ saved: null, mine: null, loading: false, error: null, reload: vi.fn(), save: vi.fn() }), weekToken: () => '2026-9-26' }))
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

// 2026-10-02: the people filter lived only on Today. The week's list now
// follows the same persisted choice.
const week = new Date(2026, 8, 26)
const row = (id: string, title: string, assignedTo?: string) => ({
  id, title, completed: false, bucket: 'week', weekStart: week, createdAt: new Date(2026, 8, 27), assignedTo,
})
const tasks = [row('m', 'Mine', 'me'), row('i', 'Iris only', 'iris'), row('u', 'Nobody yet')] as never

// The week's list is written in the session's "Write the week" (at rest the
// week is WeekViewV2's canvas, whose shelf applies the same lens).
const renderWeek = () => {
  render(<MemoryRouter><WeekV2 tasks={tasks} weekStart={week} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
  fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.endsWith('Write the week') && b.closest('.pv2-steps'))!)
}

describe('WeekV2 — the people filter narrows the week’s list', () => {
  beforeEach(() => localStorage.removeItem(ASSIGNEE_FILTER_KEY))

  it('everyone: the list keeps its own scope (mine and unassigned)', () => {
    renderWeek()
    expect(screen.getByText('Mine')).toBeTruthy()
    expect(screen.getByText('Nobody yet')).toBeTruthy()
    expect(screen.queryByText('Iris only')).toBeNull()
  })

  it('Iris chosen: her rows show, nobody else’s', () => {
    localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(['iris']))
    renderWeek()
    expect(screen.getByText('Iris only')).toBeTruthy()
    expect(screen.queryByText('Mine')).toBeNull()
    expect(screen.queryByText('Nobody yet')).toBeNull()
  })
})
