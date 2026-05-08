import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TapProjectPanel } from './TapProjectPanel'
import { createMockProject, createMockTask } from '@/test/mocks/factories'

const baseHandlers = {
  onClose: vi.fn(),
  onNotesChange: vi.fn(),
  onAddTask: vi.fn(),
  onMore: vi.fn(),
  onAddLink: vi.fn(),
  onOpenTask: vi.fn(),
  onOpenRelated: vi.fn(),
}

describe('TapProjectPanel', () => {
  it('renders project name in header', () => {
    const project = createMockProject({ id: 'p1', name: 'Liam Health' })
    render(<TapProjectPanel
      project={project} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Liam Health')).toBeInTheDocument()
  })

  it('renders open tasks under "Open work"', () => {
    const project = createMockProject({ id: 'p1', name: 'Liam Health' })
    const t1 = createMockTask({ id: 't1', projectId: 'p1', title: 'Refill rx', completed: false })
    const t2 = createMockTask({ id: 't2', projectId: 'p1', completed: true })
    render(<TapProjectPanel
      project={project} allTasks={[t1, t2]} allEvents={[]} allProjects={[]} {...baseHandlers}
    />)
    expect(screen.getByText('Refill rx')).toBeInTheDocument()
    expect(screen.getByText(/open work/i)).toBeInTheDocument()
  })

  it('calls onAddTask with text after Enter', async () => {
    const onAddTask = vi.fn()
    const project = createMockProject({ id: 'p1', name: 'Project' })
    const { user } = render(<TapProjectPanel
      project={project} allTasks={[]} allEvents={[]} allProjects={[]} {...baseHandlers} onAddTask={onAddTask}
    />)
    const input = screen.getByPlaceholderText(/add a task/i)
    await user.type(input, 'New task{Enter}')
    expect(onAddTask).toHaveBeenCalledWith('New task')
  })
})
