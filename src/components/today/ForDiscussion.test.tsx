import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ForDiscussion } from './ForDiscussion'

const onSelectItem = vi.fn()

describe('ForDiscussion', () => {
  it('renders an empty state when no items are flagged', () => {
    render(<ForDiscussion items={[]} onSelectItem={onSelectItem} />)
    expect(screen.getByText(/nothing to discuss/i)).toBeInTheDocument()
  })

  it('lists each flagged item by title', () => {
    render(
      <ForDiscussion
        items={[
          { id: 't1', title: 'Finances with Iris', note: null },
          { id: 't2', title: 'Vacation week of July 4', note: 'Pick dates' },
        ]}
        onSelectItem={onSelectItem}
      />,
    )
    expect(screen.getByText('Finances with Iris')).toBeInTheDocument()
    expect(screen.getByText('Vacation week of July 4')).toBeInTheDocument()
  })

  it('renders the discussion note when present', () => {
    render(
      <ForDiscussion
        items={[{ id: 't1', title: 'X', note: 'Pick dates' }]}
        onSelectItem={onSelectItem}
      />,
    )
    expect(screen.getByText('Pick dates')).toBeInTheDocument()
  })

  it('calls onSelectItem when an item is clicked', async () => {
    const { user } = render(
      <ForDiscussion
        items={[{ id: 't1', title: 'Finances with Iris', note: null }]}
        onSelectItem={onSelectItem}
      />,
    )
    await user.click(screen.getByRole('button', { name: /finances with iris/i }))
    expect(onSelectItem).toHaveBeenCalledWith('t1')
  })
})
