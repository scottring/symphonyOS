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

  describe('open in editor', () => {
    it('toggles completion via the checkbox when an open handler is present', async () => {
      const onToggleSubtask = vi.fn()
      const subs = [createMockTask({ id: 's1', title: 'Buy groceries', completed: false })]
      const { user } = render(
        <PanelSubtasks subtasks={subs} onToggleSubtask={onToggleSubtask} onOpenSubtask={vi.fn()} />,
      )
      await user.click(screen.getByRole('button', { name: /mark Buy groceries complete/i }))
      expect(onToggleSubtask).toHaveBeenCalledWith('s1')
    })

    it('opens the subtask in the editor when its title is clicked', async () => {
      const onOpenSubtask = vi.fn()
      const onToggleSubtask = vi.fn()
      const subs = [createMockTask({ id: 's1', title: 'Buy groceries', completed: false })]
      const { user } = render(
        <PanelSubtasks subtasks={subs} onToggleSubtask={onToggleSubtask} onOpenSubtask={onOpenSubtask} />,
      )
      await user.click(screen.getByRole('button', { name: /open Buy groceries/i }))
      expect(onOpenSubtask).toHaveBeenCalledWith('s1')
      expect(onToggleSubtask).not.toHaveBeenCalled()
    })

    it('falls back to toggling the whole row when no open handler is given', async () => {
      const onToggleSubtask = vi.fn()
      const subs = [createMockTask({ id: 's1', title: 'Buy groceries', completed: false })]
      const { user } = render(
        <PanelSubtasks subtasks={subs} onToggleSubtask={onToggleSubtask} />,
      )
      await user.click(screen.getByText('Buy groceries'))
      expect(onToggleSubtask).toHaveBeenCalledWith('s1')
    })
  })

  describe('per-subtask triage', () => {
    it('reschedules a single open subtask via the icon grid', async () => {
      const onRescheduleSubtask = vi.fn()
      const subs = [createMockTask({ id: 's1', title: 'Buy groceries', completed: false })]
      const { user } = render(
        <PanelSubtasks
          subtasks={subs}
          onToggleSubtask={vi.fn()}
          onOpenSubtask={vi.fn()}
          onRescheduleSubtask={onRescheduleSubtask}
        />,
      )
      await user.click(screen.getByRole('button', { name: /reschedule Buy groceries/i }))
      await user.click(screen.getByRole('menuitem', { name: 'Today' }))
      expect(onRescheduleSubtask).toHaveBeenCalledWith('s1', 'today')
    })

    it('does not offer reschedule on a completed subtask', () => {
      const subs = [createMockTask({ id: 's1', title: 'Done step', completed: true })]
      render(
        <PanelSubtasks
          subtasks={subs}
          onToggleSubtask={vi.fn()}
          onOpenSubtask={vi.fn()}
          onRescheduleSubtask={vi.fn()}
        />,
      )
      expect(screen.queryByRole('button', { name: /reschedule Done step/i })).not.toBeInTheDocument()
    })
  })
})
