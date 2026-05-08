import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelActions } from './PanelActions'

describe('PanelActions', () => {
  const baseProps = {
    completed: false,
    isPinned: false,
    onToggleComplete: vi.fn(),
    onSchedule: vi.fn<[Date, boolean], void>(),
    onTogglePin: vi.fn(),
    onDelete: vi.fn(),
  }

  it('renders Done button when not completed', () => {
    render(<PanelActions {...baseProps} />)
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('renders Mark incomplete when completed', () => {
    render(<PanelActions {...baseProps} completed />)
    expect(screen.getByRole('button', { name: /incomplete|reopen/i })).toBeInTheDocument()
  })

  it('renders Call button when phoneNumber present', () => {
    render(<PanelActions {...baseProps} phoneNumber="555-0107" />)
    const call = screen.getByRole('link', { name: /555-0107/ })
    expect(call).toHaveAttribute('href', 'tel:555-0107')
  })

  it('does not render Call when phoneNumber missing', () => {
    render(<PanelActions {...baseProps} />)
    expect(screen.queryByText(/call/i)).not.toBeInTheDocument()
  })

  it('calls onToggleComplete when Done clicked', async () => {
    const onToggleComplete = vi.fn()
    const { user } = render(<PanelActions {...baseProps} onToggleComplete={onToggleComplete} />)
    await user.click(screen.getByRole('button', { name: /done/i }))
    expect(onToggleComplete).toHaveBeenCalledOnce()
  })

  it('renders Schedule trigger button', () => {
    render(<PanelActions {...baseProps} />)
    expect(screen.getByText(/schedule/i)).toBeInTheDocument()
  })

  it('renders More menu trigger', () => {
    render(<PanelActions
      completed={false}
      isPinned={false}
      onToggleComplete={vi.fn()}
      onSchedule={vi.fn()}
      onTogglePin={vi.fn()}
      onDelete={vi.fn()}
    />)
    expect(screen.getByLabelText('More actions')).toBeInTheDocument()
  })
})
