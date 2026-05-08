import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelSubtasks } from './PanelSubtasks'
import { createMockTask } from '@/test/mocks/factories'

describe('PanelSubtasks', () => {
  it('renders nothing when no subtasks and onAddSubtask not provided', () => {
    const { container } = render(<PanelSubtasks subtasks={[]} onToggleSubtask={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the section with add input when onAddSubtask is provided even if empty', () => {
    render(<PanelSubtasks subtasks={[]} onToggleSubtask={vi.fn()} onAddSubtask={vi.fn()} />)
    expect(screen.getByText(/subtasks/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/add a subtask/i)).toBeInTheDocument()
  })

  it('renders subtasks with completion state', () => {
    const subs = [
      createMockTask({ id: 's1', title: 'Step one', completed: false }),
      createMockTask({ id: 's2', title: 'Step two', completed: true }),
    ]
    render(<PanelSubtasks subtasks={subs} onToggleSubtask={vi.fn()} onAddSubtask={vi.fn()} />)
    expect(screen.getByText('Step one')).toBeInTheDocument()
    expect(screen.getByText('Step two')).toBeInTheDocument()
  })

  it('calls onToggleSubtask with id when checkbox clicked', async () => {
    const onToggleSubtask = vi.fn()
    const subs = [createMockTask({ id: 's1', title: 'Step one', completed: false })]
    const { user } = render(<PanelSubtasks subtasks={subs} onToggleSubtask={onToggleSubtask} onAddSubtask={vi.fn()} />)
    await user.click(screen.getByLabelText(/mark step one/i))
    expect(onToggleSubtask).toHaveBeenCalledWith('s1')
  })

  it('calls onAddSubtask when Enter pressed in input', async () => {
    const onAddSubtask = vi.fn()
    const { user } = render(<PanelSubtasks subtasks={[]} onToggleSubtask={vi.fn()} onAddSubtask={onAddSubtask} />)
    const input = screen.getByPlaceholderText(/add a subtask/i)
    await user.type(input, 'New step{Enter}')
    expect(onAddSubtask).toHaveBeenCalledWith('New step')
  })
})
