import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task } from '@/types/task'

// History ignored the task hook's loading and error, so it said "0 completed
// tasks / No completed tasks yet" while the list was still on its way — and
// the same after a failed read.

const hook = vi.hoisted(() => ({
  tasks: [] as unknown[], loading: false, error: null as string | null, refetch: vi.fn(async () => {}),
}))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => hook }))
vi.mock('@/hooks/useContacts', () => ({ useContacts: () => ({ contactsMap: new Map() }) }))
vi.mock('@/hooks/useProjects', () => ({ useProjects: () => ({ projectsMap: new Map() }) }))

import { HistoryApp } from './HistoryApp'

const renderHistory = () => render(<MemoryRouter><HistoryApp /></MemoryRouter>)

describe('HistoryApp — loading, failed, empty', () => {
  beforeEach(() => {
    hook.tasks = []; hook.loading = false; hook.error = null; hook.refetch.mockClear()
  })

  it('while loading, states no count and no "No completed tasks yet"', () => {
    hook.loading = true
    renderHistory()
    expect(screen.getByText('Loading your history…')).toBeInTheDocument()
    expect(screen.queryByText('0 completed tasks')).toBeNull()
    expect(screen.queryByText('No completed tasks yet')).toBeNull()
  })

  it('after a failed read, says so and Try again calls the refetch', () => {
    hook.error = 'Failed to fetch'
    renderHistory()
    const notice = screen.getByRole('alert')
    expect(notice).toHaveTextContent('Your history didn’t load.')
    expect(screen.queryByText('0 completed tasks')).toBeNull()
    expect(screen.queryByText('No completed tasks yet')).toBeNull()
    fireEvent.click(within(notice).getByRole('button', { name: 'Try again' }))
    expect(hook.refetch).toHaveBeenCalledOnce()
  })

  it('a loaded, empty history keeps its empty copy', () => {
    renderHistory()
    expect(screen.getByText('0 completed tasks')).toBeInTheDocument()
    expect(screen.getByText('No completed tasks yet')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a loaded history lists its tasks', () => {
    hook.tasks = [{
      id: 't1', title: 'Weed the backyard', completed: true,
      updatedAt: new Date(2026, 7, 20), createdAt: new Date(2026, 7, 19),
    } as Task]
    renderHistory()
    expect(screen.getByText('1 completed task')).toBeInTheDocument()
    expect(screen.getByText('Weed the backyard')).toBeInTheDocument()
  })
})
