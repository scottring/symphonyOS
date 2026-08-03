import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { SlippedPointer } from './SlippedPointer'
import type { Task } from '@/types/task'

function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'timed',
    scheduledFor: null, assignedTo: null, updatedAt: new Date(),
    ...p,
  } as Task
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SlippedPointer', () => {
  it('renders nothing when the queue is empty', () => {
    const { container } = render(<SlippedPointer tasks={[]} onReview={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('states the count and the age of the oldest item', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T12:00:00'))
    const tasks = [
      task({ id: 'a', scheduledFor: new Date('2025-12-01T09:00:00') }),
      task({ id: 'b', scheduledFor: new Date('2026-07-20T09:00:00') }),
    ]
    render(<SlippedPointer tasks={tasks} onReview={() => {}} />)
    expect(screen.getByText(/2 slipped/)).toBeInTheDocument()
    expect(screen.getByText(/245 days/)).toBeInTheDocument()
  })

  it('calls onReview when activated', () => {
    const onReview = vi.fn()
    render(<SlippedPointer tasks={[task({ scheduledFor: new Date('2026-01-01') })]} onReview={onReview} />)
    screen.getByRole('button').click()
    expect(onReview).toHaveBeenCalledOnce()
  })

  it('offers no dismiss control — the queue cannot be hidden', () => {
    render(<SlippedPointer tasks={[task({ scheduledFor: new Date('2026-01-01') })]} onReview={() => {}} />)
    expect(screen.queryByRole('button', { name: /dismiss|close|hide/i })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
