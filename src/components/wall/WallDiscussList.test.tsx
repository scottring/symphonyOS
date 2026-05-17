import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallDiscussList } from './WallDiscussList'
import type { TodayItem } from './today/todayItem'

const discussItems: TodayItem[] = [
  { id: 'd1', kind: 'task', title: 'Summer camp dates', completed: false, ownerId: null, startTime: null, sourceId: 'd1', needsDiscussion: true, discussionNote: 'Confirm with Iris by Friday' },
  { id: 'd2', kind: 'task', title: 'Piano teacher payment', completed: false, ownerId: null, startTime: null, sourceId: 'd2', needsDiscussion: true },
]

describe('WallDiscussList', () => {
  it('renders nothing when items is empty', () => {
    const { container } = render(<WallDiscussList items={[]} onResolve={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders each discussion item title', () => {
    render(<WallDiscussList items={discussItems} onResolve={() => {}} />)
    expect(screen.getByText('Summer camp dates')).toBeInTheDocument()
    expect(screen.getByText('Piano teacher payment')).toBeInTheDocument()
  })

  it('shows count in header', () => {
    render(<WallDiscussList items={discussItems} onResolve={() => {}} />)
    expect(screen.getByText(/to discuss \(2\)/i)).toBeInTheDocument()
  })

  it('calls onResolve when 💬 button tapped', () => {
    const onResolve = vi.fn()
    render(<WallDiscussList items={discussItems} onResolve={onResolve} />)
    fireEvent.click(screen.getAllByRole('button', { name: /resolve discussion/i })[0])
    expect(onResolve).toHaveBeenCalledWith('d1')
  })

  it('expands note when title is tapped', () => {
    render(<WallDiscussList items={discussItems} onResolve={() => {}} />)
    fireEvent.click(screen.getByText('Summer camp dates'))
    expect(screen.getByText('Confirm with Iris by Friday')).toBeInTheDocument()
  })

  it('does not show note when item has no discussionNote', () => {
    render(<WallDiscussList items={discussItems} onResolve={() => {}} />)
    fireEvent.click(screen.getByText('Piano teacher payment'))
    expect(screen.queryByText(/confirm with iris/i)).not.toBeInTheDocument()
  })
})
