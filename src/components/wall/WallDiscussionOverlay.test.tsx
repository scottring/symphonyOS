import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallDiscussionOverlay } from './WallDiscussionOverlay'

describe('WallDiscussionOverlay', () => {
  const items = [
    { kind: 'task' as const, id: 't1', title: 'Kitchen delivery', note: 'Push by 2 weeks?', task: {} as never },
    { kind: 'event' as const, id: 'e1', title: 'Mia swim', note: '', flag: {} as never },
  ]

  it('renders all items with notes', () => {
    render(<WallDiscussionOverlay items={items} onMarkDiscussed={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Kitchen delivery')).toBeInTheDocument()
    expect(screen.getByText('Push by 2 weeks?')).toBeInTheDocument()
    expect(screen.getByText('Mia swim')).toBeInTheDocument()
  })

  it('calls onMarkDiscussed with item when button tapped', () => {
    const onMarkDiscussed = vi.fn()
    render(<WallDiscussionOverlay items={items} onMarkDiscussed={onMarkDiscussed} onClose={vi.fn()} />)
    const buttons = screen.getAllByRole('button', { name: /mark as discussed/i })
    fireEvent.click(buttons[0])
    expect(onMarkDiscussed).toHaveBeenCalledWith(items[0])
  })

  it('calls onClose when close button tapped', () => {
    const onClose = vi.fn()
    render(<WallDiscussionOverlay items={items} onMarkDiscussed={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
