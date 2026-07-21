import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { HorizonExplainer } from './HorizonExplainer'

describe('HorizonExplainer', () => {
  it('renders the first scene and advances on Next', () => {
    render(<HorizonExplainer horizon="season" open onClose={vi.fn()} />)
    expect(screen.getByText(/a pick is an outcome/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/5.*8/)).toBeInTheDocument()
  })

  it('calls onClose on Escape and the close button', () => {
    const onClose = vi.fn()
    render(<HorizonExplainer horizon="week" open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<HorizonExplainer horizon="year" open={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
