import { describe, it, expect, vi } from 'vitest'
import { screen, within, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { SlippedReview } from './SlippedReview'
import type { Task } from '@/types/task'
import type { AttentionItem, AttentionReason } from '@/lib/today/attention'

function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'timed',
    scheduledFor: null, assignedTo: null, updatedAt: new Date(),
    ...p,
  } as Task
}

function item(reason: AttentionReason, ageDays: number, p: Partial<Task>): AttentionItem {
  return { task: task(p), reason, ageDays }
}

const items: AttentionItem[] = [
  item('slipped', 3, { id: 'new', title: 'recent thing' }),
  item('slipped', 245, { id: 'old', title: 'call window blinds' }),
]

describe('SlippedReview', () => {
  it('lists oldest first with the age shown', () => {
    render(<SlippedReview items={items} onApply={() => {}} onClose={() => {}} />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('call window blinds')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/245 days/)).toBeInTheDocument()
  })

  it('applies a fate to every selected row in one action', () => {
    const onApply = vi.fn()
    render(<SlippedReview items={items} onApply={onApply} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select all/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Someday' }))
    expect(onApply).toHaveBeenCalledWith(['old', 'new'], 'someday')
  })

  it('offers all four fates', () => {
    render(<SlippedReview items={items} onApply={() => {}} onClose={() => {}} />)
    for (const name of ['Today', 'This week', 'Someday', 'Delete']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('does nothing when no rows are selected', () => {
    const onApply = vi.fn()
    render(<SlippedReview items={items} onApply={onApply} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Someday' }))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('applies to only the rows actually selected', () => {
    const onApply = vi.fn()
    render(<SlippedReview items={items} onApply={onApply} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /select recent thing/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onApply).toHaveBeenCalledWith(['new'], 'delete')
  })

  it('groups items by reason under the exact headings, in a fixed order', () => {
    const mixed: AttentionItem[] = [
      item('aging-inbox', 20, { id: 'inbox', title: 'inbox task' }),
      item('aging-month', 50, { id: 'month', title: 'month task' }),
      item('stranded-week', 10, { id: 'week', title: 'week task' }),
      item('slipped', 5, { id: 'slip', title: 'slipped task' }),
    ]
    render(<SlippedReview items={mixed} onApply={() => {}} onClose={() => {}} />)
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual([
      'Past their date',
      'Left behind on a past week',
      'Sitting in this month',
      'Never triaged',
    ])
  })

  it('omits a heading for a reason with no items', () => {
    render(<SlippedReview items={items} onApply={() => {}} onClose={() => {}} />)
    expect(screen.queryByText('Sitting in this month')).toBeNull()
    expect(screen.queryByText('Never triaged')).toBeNull()
    expect(screen.queryByText('Left behind on a past week')).toBeNull()
    expect(screen.getByText('Past their date')).toBeInTheDocument()
  })
})
