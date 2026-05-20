import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PantryShelfRail } from './PantryShelfRail'

describe('PantryShelfRail', () => {
  it('renders the count and first few missing item names', () => {
    render(
      <PantryShelfRail
        missingItems={[
          { text: 'Snap peas', category: 'Produce', fromRecipeIds: [] },
          { text: 'Brown rice', category: 'Pantry', fromRecipeIds: [] },
        ]}
        onReview={vi.fn()}
      />,
    )
    expect(screen.getByText(/2 ingredients missing/i)).toBeInTheDocument()
    expect(screen.getByText('Snap peas')).toBeInTheDocument()
    expect(screen.getByText('Brown rice')).toBeInTheDocument()
  })

  it('caps the shown items at 4 and surfaces a "+N more" hint', () => {
    render(
      <PantryShelfRail
        missingItems={[
          { text: 'Item 1', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 2', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 3', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 4', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 5', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 6', category: 'Pantry', fromRecipeIds: [] },
        ]}
        onReview={vi.fn()}
      />,
    )
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 4')).toBeInTheDocument()
    expect(screen.queryByText('Item 5')).not.toBeInTheDocument()
    expect(screen.getByText(/\+2 more/i)).toBeInTheDocument()
  })

  it('renders empty state when nothing is missing', () => {
    render(<PantryShelfRail missingItems={[]} onReview={vi.fn()} />)
    expect(screen.getByText(/pantry is stocked/i)).toBeInTheDocument()
  })

  it('calls onReview when the row is clicked', async () => {
    const onReview = vi.fn()
    const { user } = render(
      <PantryShelfRail
        missingItems={[{ text: 'Snap peas', category: 'Produce', fromRecipeIds: [] }]}
        onReview={onReview}
      />,
    )
    await user.click(screen.getByRole('button', { name: /review groceries/i }))
    expect(onReview).toHaveBeenCalledTimes(1)
  })
})
