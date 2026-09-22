import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { SomedayPage } from './SomedayPage'
import { createMockTask } from '@/test/mocks/factories'

// Someday was a one-way door: the route redirected to Today, so a task sent
// there could only be found by search (walkthrough, 2026-09-20).
const hook = vi.hoisted(() => ({
  tasks: [] as unknown[],
  toggleTask: vi.fn(), updateTask: vi.fn(async () => {}), deleteTask: vi.fn(async () => {}),
  pushTask: vi.fn(async () => {}), updateTasksBulk: vi.fn(async () => {}),
}))
vi.mock('@/hooks/useSupabaseTasks', () => ({
  useSupabaseTasks: () => ({ loading: false, ...hook }),
}))

describe('SomedayPage', () => {
  beforeEach(() => {
    hook.pushTask.mockClear(); hook.deleteTask.mockClear(); hook.toggleTask.mockClear()
    hook.tasks = [
      createMockTask({ id: 's1', title: 'Learn the cello', bucket: 'someday', context: 'personal' }),
      createMockTask({ id: 's2', title: 'Repaint the shed', bucket: 'someday', context: 'family', completed: true }),
      createMockTask({ id: 'w1', title: 'Call the plumber', bucket: 'week', context: 'family' }),
    ]
  })

  it('lists what was set aside — open someday rows only', () => {
    render(<SomedayPage />)
    expect(screen.getByRole('heading', { name: 'Someday' })).toBeInTheDocument()
    expect(screen.getByText('Learn the cello')).toBeInTheDocument()
    expect(screen.queryByText('Repaint the shed')).not.toBeInTheDocument()
    expect(screen.queryByText('Call the plumber')).not.toBeInTheDocument()
  })

  it('pulls a row back onto today through the same verdict handlers as the review', async () => {
    render(<SomedayPage />)
    fireEvent.click(screen.getByRole('button', { name: /^Do today/ }))
    await vi.waitFor(() => expect(hook.pushTask).toHaveBeenCalledWith('s1', expect.any(Date)))
  })

  it('says so when nothing is set aside', () => {
    hook.tasks = []
    render(<SomedayPage />)
    expect(screen.getByText('Nothing set aside.')).toBeInTheDocument()
  })

  it('distinguishes a filtered-empty view from an empty shelf and offers the way out', () => {
    localStorage.setItem('symphony-layers', JSON.stringify(['work']))
    try {
      render(<SomedayPage />)
      expect(screen.queryByText('Nothing set aside.')).not.toBeInTheDocument()
      expect(screen.getByText(/Nothing set aside in the domains you're viewing/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Show all domains' }))
      expect(screen.getByText('Learn the cello')).toBeInTheDocument()
    } finally {
      localStorage.removeItem('symphony-layers')
    }
  })

  it('a one-tap delete waits out an Undo window, and Undo keeps the task', async () => {
    render(<SomedayPage />)
    fireEvent.click(screen.getByRole('button', { name: /More/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete "Learn the cello"' }))
    expect(screen.queryByText('Learn the cello')).not.toBeInTheDocument()
    expect(hook.deleteTask).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))
    expect(screen.getByText('Learn the cello')).toBeInTheDocument()
    expect(hook.deleteTask).not.toHaveBeenCalled()
  })

  it('deletes for real once the Undo toast is dismissed', () => {
    render(<SomedayPage />)
    fireEvent.click(screen.getByRole('button', { name: /More/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete "Learn the cello"' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(hook.deleteTask).toHaveBeenCalledWith('s1')
  })
})
