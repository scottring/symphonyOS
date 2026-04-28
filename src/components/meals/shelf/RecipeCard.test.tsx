import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecipeCard } from './RecipeCard'
import type { Recipe } from '@/types/meal-planner'

const sample: Recipe = {
  id: 'r1', userId: 'u1',
  title: 'Sheet-Pan Salmon',
  sourceLabel: 'NYT Cooking',
  prepMinutes: 30,
  ingredients: [], instructions: [], tags: [],
  kidAcceptance: {},
  acceptanceSentence: 'Both kids love this.',
  isPrepFriendly: false,
  timesCooked: 8,
  lastCookedAt: new Date('2026-04-15'),
  streakNote: 'The Wednesday default.',
  createdAt: new Date(), updatedAt: new Date(),
}

describe('RecipeCard', () => {
  it('renders title and kid-acceptance sentence', () => {
    render(<RecipeCard recipe={sample} onClick={() => {}} />)
    expect(screen.getByText('Sheet-Pan Salmon')).toBeInTheDocument()
    expect(screen.getByText(/Both kids love this/)).toBeInTheDocument()
  })

  it('renders source label and minutes in the kicker', () => {
    render(<RecipeCard recipe={sample} onClick={() => {}} />)
    expect(screen.getByText(/NYT Cooking/)).toBeInTheDocument()
    expect(screen.getByText(/30 MIN/i)).toBeInTheDocument()
  })

  it('shows NEVER COOKED kicker for never-cooked recipes', () => {
    const neverCooked = { ...sample, lastCookedAt: undefined, timesCooked: 0 }
    render(<RecipeCard recipe={neverCooked} onClick={() => {}} />)
    expect(screen.getByText(/NEVER COOKED/i)).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<RecipeCard recipe={sample} onClick={onClick} />)
    fireEvent.click(screen.getByText('Sheet-Pan Salmon'))
    expect(onClick).toHaveBeenCalledWith(sample)
  })
})
