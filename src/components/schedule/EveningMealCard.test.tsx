import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { EveningMealCard } from './EveningMealCard'

describe('EveningMealCard', () => {
  it('renders title, sides, time and a View recipe link when recipeUrl present', () => {
    render(<EveningMealCard title="Pasta e fagioli" sides="wilted spinach · big green salad"
      timeLabel="6:30 PM" recipeUrl="https://r.co/x" onSelect={vi.fn()} />)
    expect(screen.getByText('Pasta e fagioli')).toBeInTheDocument()
    expect(screen.getByText(/wilted spinach/)).toBeInTheDocument()
    expect(screen.getByText('6:30 PM')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view recipe/i })).toHaveAttribute('href', 'https://r.co/x')
  })
  it('omits the recipe link when no recipeUrl', () => {
    render(<EveningMealCard title="Leftovers" timeLabel="6:30 PM" onSelect={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /view recipe/i })).not.toBeInTheDocument()
  })
  it('calls onSelect when the card body is clicked', async () => {
    const onSelect = vi.fn()
    const { user } = render(<EveningMealCard title="X" timeLabel="6:30 PM" onSelect={onSelect} />)
    await user.click(screen.getByText('X'))
    expect(onSelect).toHaveBeenCalled()
  })
})
