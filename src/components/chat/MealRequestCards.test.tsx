import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MealRequestCards } from './MealRequestCards'

const applySuggestion = vi.fn().mockResolvedValue(undefined)
vi.mock('@/hooks/useApplyMealSuggestion', () => ({
  useApplyMealSuggestion: () => ({ applySuggestion }),
}))
vi.mock('@/lib/askSymphonyMeal', () => ({
  fetchMealSuggestions: vi.fn().mockResolvedValue({
    text: 'Here are options',
    cards: [{ kind: 'add', kicker: 'Tue', title: 'Pasta', why: 'veg-forward',
      apply: { dayOfWeek: 2, slot: 'dinner', adHocTitle: 'Pasta' } }],
  }),
}))

describe('MealRequestCards', () => {
  it('fetches and renders a suggestion, applies on click', async () => {
    render(<MealRequestCards request="add pasta to Tuesday" />)
    await waitFor(() => expect(screen.getByText('Pasta')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(applySuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'add' }),
    ))
  })
})
