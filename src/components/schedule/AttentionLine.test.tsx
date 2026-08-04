import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AttentionLine } from './AttentionLine'
import type { AttentionItem } from '@/lib/today/attention'
import type { Task } from '@/types/task'

function item(id: string, reason: AttentionItem['reason'], ageDays: number): AttentionItem {
  return { task: { id, title: id } as Task, reason, ageDays }
}

describe('AttentionLine', () => {
  it('renders nothing when there is nothing to attend to', () => {
    const { container } = render(<AttentionLine items={[]} onReview={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('states the count and the oldest age', () => {
    render(<AttentionLine items={[item('a', 'slipped', 5), item('b', 'stranded-week', 38)]} onReview={() => {}} />)
    expect(screen.getByText(/2 need attention/)).toBeInTheDocument()
    expect(screen.getByText(/oldest 38 days/)).toBeInTheDocument()
  })

  it('says "1 needs attention" for a single item', () => {
    render(<AttentionLine items={[item('a', 'slipped', 3)]} onReview={() => {}} />)
    expect(screen.getByText(/1 needs attention/)).toBeInTheDocument()
  })

  // The floor guarantee, inherited verbatim from SlippedPointer: the pointer
  // back to work that left Today must be impossible to lose.
  it('offers no way to dismiss it', () => {
    render(<AttentionLine items={[item('a', 'slipped', 3)]} onReview={() => {}} />)
    expect(screen.queryByRole('button', { name: /dismiss|close|not now/i })).toBeNull()
  })

  it('calls onReview when activated', async () => {
    const onReview = vi.fn()
    render(<AttentionLine items={[item('a', 'slipped', 3)]} onReview={onReview} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onReview).toHaveBeenCalledOnce()
  })

  // The invariant, at component scale.
  it('renders the same number of rows for 3 items as for 300', () => {
    const few = Array.from({ length: 3 }, (_, i) => item(`f${i}`, 'aging-inbox', i + 1))
    const many = Array.from({ length: 300 }, (_, i) => item(`m${i}`, 'aging-inbox', i + 1))
    const a = render(<AttentionLine items={few} onReview={() => {}} />)
    const aCount = a.container.querySelectorAll('button').length
    a.unmount()
    const b = render(<AttentionLine items={many} onReview={() => {}} />)
    expect(b.container.querySelectorAll('button').length).toBe(aCount)
  })
})
