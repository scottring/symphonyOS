import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PanelAssistant } from './PanelAssistant'
import { ContextChips } from '@/components/context/ContextChips'

vi.mock('@/components/context/ContextChips', () => ({
  ContextChips: vi.fn(),
}))

const mockContextChips = vi.mocked(ContextChips)

describe('PanelAssistant', () => {
  it('renders ContextChips with the task id, panel variant, and guided-chat handler', () => {
    mockContextChips.mockReturnValue(<div>Call the vet</div>)
    const onOpenGuidedChat = vi.fn()

    render(<PanelAssistant taskId="task-1" onOpenGuidedChat={onOpenGuidedChat} />)

    expect(screen.getByText('Call the vet')).toBeInTheDocument()
    expect(mockContextChips).toHaveBeenCalled()
    expect(mockContextChips.mock.calls[0][0]).toEqual({
      entityType: 'task',
      entityId: 'task-1',
      variant: 'panel',
      onOpenGuidedChat,
    })
  })

  it('renders nothing visible when ContextChips returns null', () => {
    mockContextChips.mockReturnValue(null)

    const { container } = render(<PanelAssistant taskId="task-1" />)

    expect(container).toBeEmptyDOMElement()
  })
})
