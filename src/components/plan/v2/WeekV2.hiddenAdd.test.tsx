import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ASSIGNEE_FILTER_KEY } from '@/hooks/useAssigneeFilter'

// The week's list adds as mine. With the people filter on someone else the
// new line can't show: the list says so, and Show it widens the view only.
const writes = vi.hoisted(() => ({ addTask: vi.fn(async () => 'n1' as string | undefined), updateTask: vi.fn(), gatedUpdate: vi.fn(), pushTask: vi.fn() }))
vi.mock('@/hooks/usePlanningSession', () => ({ usePlanningSession: () => ({ saved: null, mine: null, loading: false, error: null, reload: vi.fn(), save: vi.fn() }), weekToken: () => '2026-9-26' }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ toggleTask: vi.fn(), updateTask: writes.updateTask, pushTask: writes.pushTask, updateTasksBulk: vi.fn(), keepForward: vi.fn(), dropCommitment: vi.fn(), addTask: writes.addTask }) }))
vi.mock('@/hooks/useGatedTaskActions', () => ({ useGatedTaskActions: () => ({ updateTask: writes.gatedUpdate, pushTask: writes.pushTask }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => ({ members: [{ id: 'me', name: 'Sam' }, { id: 'iris', name: 'Iris' }] }) }))
vi.mock('@/hooks/useActionableInstances', () => ({ useActionableInstances: () => ({ setPlanned: vi.fn(), reschedule: vi.fn() }) }))
vi.mock('./AddArea', () => ({ useAddArea: () => ({ area: undefined, picker: null }) }))
vi.mock('./FromPaper', () => ({ FromPaper: () => null }))
vi.mock('@/hooks/useDayPlan', () => ({ useDayPlan: () => ({ plan: null, loading: false, error: false }) }))

import { WeekV2 } from './WeekV2'

const week = new Date(2026, 8, 26)
const renderWeek = () => render(<MemoryRouter><WeekV2 tasks={[]} weekStart={week} meId="me" isCurrent days={null} onSelectTask={vi.fn()} /></MemoryRouter>)
const add = (title: string) => {
  const input = screen.getByRole('textbox', { name: 'Add to this week' })
  fireEvent.change(input, { target: { value: title } })
  fireEvent.submit(input.closest('form')!)
}

describe('WeekV2 — a new line the people filter hides says so', () => {
  beforeEach(() => { localStorage.removeItem(ASSIGNEE_FILTER_KEY); Object.values(writes).forEach((f) => f.mockClear()) })

  it('Iris chosen: my new line is saved, the list says why it is not shown, Show it widens the view only', async () => {
    localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(['iris']))
    renderWeek()
    expect(screen.getByText('Showing only Iris’s items')).toBeTruthy()
    add('Call the plumber')
    const notice = (await screen.findByText(/It’s hidden because/)).closest('[role="status"]')!
    expect(notice.textContent).toContain('Saved to this week. It’s hidden because you’re showing only Iris’s items.')
    fireEvent.click(screen.getByRole('button', { name: 'Show it' }))
    expect(JSON.parse(localStorage.getItem(ASSIGNEE_FILTER_KEY)!)).toEqual([])
    expect(screen.queryByText(/It’s hidden because/)).toBeNull()
    expect(writes.updateTask).not.toHaveBeenCalled()
    expect(writes.gatedUpdate).not.toHaveBeenCalled()
    expect(writes.pushTask).not.toHaveBeenCalled()
  })

  it('everyone: no notice', async () => {
    renderWeek()
    add('Call the plumber')
    await waitFor(() => expect(writes.addTask).toHaveBeenCalled())
    await Promise.resolve()
    expect(screen.queryByText(/It’s hidden because/)).toBeNull()
  })
})
