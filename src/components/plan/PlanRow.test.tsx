import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlanRow, rowIsDone, rowOwnsCompletion, type PlanRowModel } from './PlanRow'

const row = (over: Partial<PlanRowModel> = {}): PlanRowModel => ({
  id: 'r1', title: 'Fix the back door', isGoal: false, fate: 'open', kind: 'task', ...over,
})

describe('PlanRow', () => {
  it('separates rows with a hairline, and the last one leaves it to the card', () => {
    render(
      <ul>
        <PlanRow row={row({ id: 'a', title: 'A' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} />
        <PlanRow row={row({ id: 'b', title: 'B' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} />
      </ul>,
    )
    const items = screen.getAllByRole('listitem')
    for (const li of items) {
      expect(li.className).toContain('border-b')
      // The hover runs the full width rather than floating as an inset chip.
      expect(li.className).not.toContain('rounded-lg')
      expect(li.className).toContain('last:border-0')
    }
  })

  it('a goal reads as a promise, a task as a line', () => {
    render(<ul><PlanRow row={row({ isGoal: true, title: 'A home easier to care for' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    expect(screen.getByText('A home easier to care for').className).toContain('font-display')
  })
})

describe('the two questions a finished row answers', () => {
  it('reads as finished is not may be reopened here', () => {
    expect(rowIsDone('placed-done')).toBe(true)
    expect(rowOwnsCompletion('placed-done')).toBe(false)
  })
})
