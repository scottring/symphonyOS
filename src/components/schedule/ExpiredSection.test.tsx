import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { Task } from '@/types/task'
import type { ExpiredRow } from '@/lib/today/expired'
import { ExpiredSection } from './ExpiredSection'

const task = (over: Partial<Task> = {}): Task => ({
  id: 't', title: 'A thing', completed: false, bucket: 'timed',
  createdAt: new Date(), updatedAt: new Date(),
  ...over,
} as Task)

const row = (id: string, title: string, ageDays: number): ExpiredRow =>
  ({ task: task({ id, title }), ageDays })

const base = {
  canDelete: true,
  onUpdateTask: vi.fn(),
  onPushTask: vi.fn(),
  onDeleteTask: vi.fn(),
}

describe('ExpiredSection', () => {
  it('renders nothing when nothing has expired', () => {
    const { container } = render(<ExpiredSection {...base} rows={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  // Collapsed by default so a fresh capture is still the first thing on the
  // page — the pile is reference material, not a greeting.
  it('starts collapsed, showing the count and the oldest age', () => {
    render(<ExpiredSection {...base} rows={[row('a', 'Respond to Christian', 1), row('b', 'Old thing', 25)]} />)
    expect(screen.getByText('Expired · 2')).toBeInTheDocument()
    expect(screen.getByText(/oldest 3 weeks ago/)).toBeInTheDocument()
    expect(screen.queryByText('Respond to Christian')).not.toBeInTheDocument()
  })

  it('expands to the COMPLETE list — no cap, no five-a-session', async () => {
    const rows = Array.from({ length: 26 }, (_, i) => row(`t${i}`, `Expired ${i}`, i + 1))
    const { user } = render(<ExpiredSection {...base} rows={rows} />)
    await user.click(screen.getByRole('button', { name: /Expired · 26/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(26)
    expect(screen.getByText('Expired 0')).toBeInTheDocument()
    expect(screen.getByText('Expired 25')).toBeInTheDocument()
  })

  it('a verdict writes through the shared pushTask handler and resolves the row', async () => {
    const onPushTask = vi.fn()
    const { user } = render(
      <ExpiredSection {...base} onPushTask={onPushTask} rows={[row('c', 'Respond to Christian', 1)]} />,
    )
    await user.click(screen.getByRole('button', { name: /Expired · 1/ }))
    const li = screen.getByText('Respond to Christian').closest('li')!
    await user.click(within(li).getByRole('button', { name: 'Today' }))
    expect(onPushTask).toHaveBeenCalledWith('c', expect.any(Date))
    expect(within(li).getByText('today')).toBeInTheDocument()
  })

  // Same fate the Review drawer offers — the two lists must not disagree
  // about what you can do to a row.
  it('can mark an expired row done rather than rescheduling it', async () => {
    const onCompleteTask = vi.fn()
    const { user } = render(
      <ExpiredSection {...base} onCompleteTask={onCompleteTask} rows={[row('c', 'Throw out umbrella', 25)]} />,
    )
    await user.click(screen.getByRole('button', { name: /Expired · 1/ }))
    const li = screen.getByText('Throw out umbrella').closest('li')!
    await user.click(within(li).getByRole('button', { name: 'Complete "Throw out umbrella"' }))
    expect(onCompleteTask).toHaveBeenCalledWith('c')
    expect(within(li).getByText('done')).toBeInTheDocument()
  })

  // The whole point of holding a resolved row: a verdict takes it out of
  // selectExpired, so re-rendering with the new (shorter) prop must not make
  // the row you just ticked disappear from under your cursor.
  it('a resolved row stays put after it leaves the incoming rows', async () => {
    const kept = row('c', 'Throw out umbrella', 25)
    const { user, rerender } = render(
      <ExpiredSection {...base} onCompleteTask={vi.fn()} rows={[kept, row('d', 'Other thing', 3)]} />,
    )
    await user.click(screen.getByRole('button', { name: /Expired · 2/ }))
    await user.click(screen.getByRole('button', { name: 'Complete "Throw out umbrella"' }))

    // The selector no longer returns it — it isn't open-and-past-dated anymore.
    rerender(<ExpiredSection {...base} onCompleteTask={vi.fn()} rows={[row('d', 'Other thing', 3)]} />)

    const li = screen.getByText('Throw out umbrella').closest('li')!
    expect(within(li).getByText('done')).toBeInTheDocument()
    // The count is honest immediately even though the row is still on screen.
    expect(screen.getByText('Expired · 1')).toBeInTheDocument()
  })

  it('says "yesterday" rather than "1 days ago"', async () => {
    const { user } = render(<ExpiredSection {...base} rows={[row('c', 'Respond to Christian', 1)]} />)
    await user.click(screen.getByRole('button', { name: /Expired · 1/ }))
    const li = screen.getByText('Respond to Christian').closest('li')!
    expect(within(li).getByText('yesterday')).toBeInTheDocument()
  })
})
