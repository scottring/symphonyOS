import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscussionBadge } from './DiscussionBadge'
import type { DiscussionItem } from '@/lib/discussionItems'

const items: DiscussionItem[] = [
  { id: 'a', title: 'Check finances with Iris', note: null },
  { id: 'b', title: 'Plan trip', note: 'flights vs train' },
]

describe('DiscussionBadge', () => {
  it('shows the count', () => {
    render(<DiscussionBadge items={items} onSelectItem={vi.fn()} />)
    expect(screen.getByText('2 to discuss')).toBeInTheDocument()
  })

  it('opens a popover listing items and selects on click', () => {
    const onSelectItem = vi.fn()
    render(<DiscussionBadge items={items} onSelectItem={onSelectItem} />)
    fireEvent.click(screen.getByRole('button', { name: /to discuss/i }))
    fireEvent.click(screen.getByText('Check finances with Iris'))
    expect(onSelectItem).toHaveBeenCalledWith('task-a')
  })
})
