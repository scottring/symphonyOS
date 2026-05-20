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

  it('renders Meal plan chip when fromPlan is true', () => {
    render(<EveningMealCard title="X" timeLabel="6:30 PM" fromPlan onSelect={vi.fn()} />)
    expect(screen.getByText(/meal plan/i)).toBeInTheDocument()
  })

  it('omits Meal plan chip when fromPlan is false/undefined', () => {
    render(<EveningMealCard title="X" timeLabel="6:30 PM" onSelect={vi.fn()} />)
    expect(screen.queryByText(/meal plan/i)).not.toBeInTheDocument()
  })

  it('renders Serves N pill when servesCount is provided', () => {
    render(<EveningMealCard title="X" timeLabel="6:30 PM" servesCount={4} onSelect={vi.fn()} />)
    expect(screen.getByText(/serves 4/i)).toBeInTheDocument()
  })

  it('renders diner avatars with initials', () => {
    render(
      <EveningMealCard
        title="X"
        timeLabel="6:30 PM"
        diners={[
          { id: 'a', initials: 'IR', color: 'purple' },
          { id: 'b', initials: 'SK', color: 'blue' },
        ]}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('IR')).toBeInTheDocument()
    expect(screen.getByText('SK')).toBeInTheDocument()
  })

  it('caps avatar render at 4 diners', () => {
    render(
      <EveningMealCard
        title="X"
        timeLabel="6:30 PM"
        diners={[
          { id: 'a', initials: 'A', color: 'blue' },
          { id: 'b', initials: 'B', color: 'blue' },
          { id: 'c', initials: 'C', color: 'blue' },
          { id: 'd', initials: 'D', color: 'blue' },
          { id: 'e', initials: 'E', color: 'blue' },
        ]}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(screen.queryByText('E')).not.toBeInTheDocument()
  })
})
