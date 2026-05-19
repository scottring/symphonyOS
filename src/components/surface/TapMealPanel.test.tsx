import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TapMealPanel } from './TapMealPanel'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const removeMeal = vi.fn().mockResolvedValue(undefined)
const addMeal = vi.fn().mockResolvedValue(undefined)

vi.mock('@/hooks/useMealPlan', () => ({
  useMealPlan: () => ({
    plan: {
      id: 'mp1',
      entries: [
        { id: 'entry1', dayOfWeek: 2, slot: 'dinner', recipeId: 'r1', adHocTitle: 'Pasta e fagioli + salad' },
      ],
    },
    addMeal,
    removeMeal,
    loading: false,
    error: null,
    refresh: vi.fn(),
    setParameter: vi.fn(),
    clearWeek: vi.fn(),
    updateMealPreparer: vi.fn(),
  }),
}))
vi.mock('@/hooks/useRecipes', () => ({
  useRecipes: () => ({
    recipes: [{
      id: 'r1',
      title: 'Skillet Lasagna',
      sourceUrl: 'https://x.test/l',
      ingredients: ['pasta', 'tomatoes', 'cheese'],
    }],
  }),
}))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({ members: [] }),
}))

const mealEvent = {
  id: 'meal:entry1',
  title: 'Dinner · Pasta e fagioli + salad',
  start_time: '2026-05-19T18:30:00.000Z',
  calendar_name: 'Meals',
} as unknown as CalendarEvent

describe('TapMealPanel', () => {
  beforeEach(() => { removeMeal.mockClear(); addMeal.mockClear() })

  it('renders the meal title and recipe info (not generic event chrome)', () => {
    render(<TapMealPanel event={mealEvent} onClose={vi.fn()} />)
    // The event title shows in the header
    expect(screen.getByText('Dinner · Pasta e fagioli + salad')).toBeInTheDocument()
    // The WHY section surfaces the recipe title via PanelWhy notes prop
    expect(screen.getByText('Recipe: Skillet Lasagna')).toBeInTheDocument()
    // Generic event panel labels must NOT appear for a meal
    // (What to bring only renders when entry.notes has text or onChange is provided)
    expect(screen.queryByText('What to bring')).not.toBeInTheDocument()
  })

  it('opens the recipe picker when "Change recipe" is clicked', () => {
    render(<TapMealPanel event={mealEvent} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /change recipe/i }))
    // RecipePickerModal renders a Cancel button when open
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('removes the meal from the plan and closes', async () => {
    const onClose = vi.fn()
    render(<TapMealPanel event={mealEvent} onClose={onClose} />)
    // Delete path: More actions menu → Delete → Confirm delete
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await vi.waitFor(() => expect(removeMeal).toHaveBeenCalledWith('entry1'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders ABOUT, INGREDIENTS, LINKS & FILES, CREATED sections for a recipe-backed meal', async () => {
    // reuses the file's existing mock harness (recipe with ingredients + sourceUrl)
    render(<TapMealPanel event={mealEvent} onClose={vi.fn()} />)
    expect(await screen.findByText(/ingredients/i)).toBeInTheDocument()
    expect(screen.getByText('pasta')).toBeInTheDocument()           // an ingredient from the mock
    expect(screen.getByText(/^links$/i)).toBeInTheDocument()         // PanelLinks eyebrow (recipe.sourceUrl present)
    expect(screen.getByText(/created/i)).toBeInTheDocument()         // PanelFooter
  })
})
