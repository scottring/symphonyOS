import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { MealHighlights } from './MealHighlights'

describe('MealHighlights', () => {
  it('renders dinners-planned with prep range', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 5, prepRange: '30–45 min', newRecipesThisWeek: 2 }}
      />,
    )
    expect(screen.getByText(/5 dinners planned/i)).toBeInTheDocument()
    expect(screen.getByText(/30–45 min/)).toBeInTheDocument()
  })

  it('uses singular wording for one dinner', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 1, prepRange: null, newRecipesThisWeek: 0 }}
      />,
    )
    expect(screen.getByText(/1 dinner planned/i)).toBeInTheDocument()
  })

  it('shows new-recipes line when > 0', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 1, prepRange: null, newRecipesThisWeek: 2 }}
      />,
    )
    expect(screen.getByText(/2 new recipes/i)).toBeInTheDocument()
  })

  it('omits new-recipes line when 0', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 1, prepRange: null, newRecipesThisWeek: 0 }}
      />,
    )
    expect(screen.queryByText(/new recipes/i)).not.toBeInTheDocument()
  })

  it('renders empty state when no dinners planned', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 0, prepRange: null, newRecipesThisWeek: 0 }}
      />,
    )
    expect(screen.getByText(/no dinners planned yet/i)).toBeInTheDocument()
  })
})
