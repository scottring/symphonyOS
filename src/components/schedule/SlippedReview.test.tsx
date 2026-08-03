import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, within, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { SlippedReview } from './SlippedReview'
import type { Task } from '@/types/task'

function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'timed',
    scheduledFor: null, assignedTo: null, updatedAt: new Date(),
    ...p,
  } as Task
}

const tasks = [
  task({ id: 'new', title: 'recent thing', scheduledFor: new Date('2026-07-20T09:00:00') }),
  task({ id: 'old', title: 'call window blinds', scheduledFor: new Date('2025-12-01T09:00:00') }),
]

afterEach(() => {
  vi.useRealTimers()
})

describe('SlippedReview', () => {
  it('lists oldest first with the age shown', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T12:00:00'))
    render(<SlippedReview tasks={tasks} onApply={() => {}} onClose={() => {}} />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('call window blinds')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/245 days/)).toBeInTheDocument()
  })

  it('applies a fate to every selected row in one action', () => {
    const onApply = vi.fn()
    render(<SlippedReview tasks={tasks} onApply={onApply} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select all/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Someday' }))
    expect(onApply).toHaveBeenCalledWith(['old', 'new'], 'someday')
  })

  it('offers all four fates', () => {
    render(<SlippedReview tasks={tasks} onApply={() => {}} onClose={() => {}} />)
    for (const name of ['Today', 'This week', 'Someday', 'Delete']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('does nothing when no rows are selected', () => {
    const onApply = vi.fn()
    render(<SlippedReview tasks={tasks} onApply={onApply} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Someday' }))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('applies to only the rows actually selected', () => {
    const onApply = vi.fn()
    render(<SlippedReview tasks={tasks} onApply={onApply} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select recent thing/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onApply).toHaveBeenCalledWith(['new'], 'delete')
  })
})
