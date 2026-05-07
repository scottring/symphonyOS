import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallDiscussionWidget } from './WallDiscussionWidget'

describe('WallDiscussionWidget', () => {
  it('renders nothing when items list is empty', () => {
    const { container } = render(<WallDiscussionWidget items={[]} onClick={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows count and first item title when populated', () => {
    render(
      <WallDiscussionWidget
        items={[
          { kind: 'task', id: '1', title: 'Kitchen delivery', note: '', task: {} as never },
          { kind: 'event', id: '2', title: 'Mia swim', note: '', flag: {} as never },
        ]}
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText(/2 to discuss/i)).toBeInTheDocument()
    expect(screen.getByText('Kitchen delivery')).toBeInTheDocument()
  })

  it('shows +N more for >2 items', () => {
    render(
      <WallDiscussionWidget
        items={[
          { kind: 'task', id: '1', title: 'A', note: '', task: {} as never },
          { kind: 'task', id: '2', title: 'B', note: '', task: {} as never },
          { kind: 'task', id: '3', title: 'C', note: '', task: {} as never },
          { kind: 'task', id: '4', title: 'D', note: '', task: {} as never },
        ]}
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText(/\+2 more/i)).toBeInTheDocument()
  })

  it('calls onClick when card is tapped', () => {
    const onClick = vi.fn()
    render(
      <WallDiscussionWidget
        items={[{ kind: 'task', id: '1', title: 'A', note: '', task: {} as never }]}
        onClick={onClick}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /to discuss/i }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
