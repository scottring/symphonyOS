import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { RecipePickerModal } from './RecipePickerModal'

// The modal's own recipe-shelf hook — irrelevant to the Ideas tab, stub it flat.
vi.mock('@/hooks/useRecipes', () => ({
  useRecipes: () => ({ recipes: [], loading: false, addByUrl: vi.fn(), addManual: vi.fn() }),
}))

// Controllable AI hook so we can drive the Ideas tab.
const { aiState, suggestMock, resetMock } = vi.hoisted(() => ({
  aiState: { suggestions: [] as unknown[], loading: false, error: null as string | null },
  suggestMock: vi.fn(),
  resetMock: vi.fn(),
}))
vi.mock('@/hooks/useMealSlotSuggestions', () => ({
  useMealSlotSuggestions: () => ({
    suggestions: aiState.suggestions,
    loading: aiState.loading,
    error: aiState.error,
    suggest: suggestMock,
    reset: resetMock,
  }),
}))

const baseProps = {
  isOpen: true,
  slot: 'dinner' as const,
  familyMembers: [],
  onClose: vi.fn(),
  onPick: vi.fn(),
  onPickLeftover: vi.fn(),
  onApplyNewRecipe: vi.fn(),
}

describe('RecipePickerModal — Ideas tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiState.suggestions = []
    aiState.loading = false
    aiState.error = null
  })

  it('hides the Ideas tab when week/day context is absent', () => {
    render(<RecipePickerModal {...baseProps} />)
    expect(screen.queryByRole('button', { name: /Ideas/ })).toBeNull()
  })

  it('shows the Ideas tab when week + day are provided', () => {
    render(<RecipePickerModal {...baseProps} weekStart={new Date('2026-07-19')} dayOfWeek={3} />)
    expect(screen.getByRole('button', { name: /Ideas/ })).toBeInTheDocument()
  })

  it('Suggest asks the AI hook for ideas for the slot', () => {
    render(<RecipePickerModal {...baseProps} weekStart={new Date('2026-07-19')} dayOfWeek={3} />)
    fireEvent.click(screen.getByRole('button', { name: /Ideas/ }))
    fireEvent.change(screen.getByLabelText('Describe what you want'), { target: { value: 'lighter' } })
    fireEvent.click(screen.getByRole('button', { name: /Suggest/ }))

    expect(suggestMock).toHaveBeenCalledTimes(1)
    expect(suggestMock).toHaveBeenCalledWith(
      expect.objectContaining({ dayOfWeek: 3, slot: 'dinner', intent: 'lighter' }),
    )
  })

  it('tapping a shelf suggestion applies it via onPick', () => {
    aiState.suggestions = [{ source: 'shelf', recipeId: 'r-42', title: 'Salmon', why: 'uses the dill' }]
    render(<RecipePickerModal {...baseProps} weekStart={new Date('2026-07-19')} dayOfWeek={3} />)
    fireEvent.click(screen.getByRole('button', { name: /Ideas/ }))

    fireEvent.click(screen.getByRole('button', { name: /Salmon/ }))
    expect(baseProps.onPick).toHaveBeenCalledWith('r-42', null)
    expect(baseProps.onApplyNewRecipe).not.toHaveBeenCalled()
  })

  it('tapping a new suggestion saves it via onApplyNewRecipe', async () => {
    aiState.suggestions = [{
      source: 'new', title: 'Farro Bowl', why: 'veggie night',
      ingredients: ['1 cup farro'], instructions: ['cook it'], prepMinutes: 25, tags: ['veggie'],
    }]
    render(<RecipePickerModal {...baseProps} weekStart={new Date('2026-07-19')} dayOfWeek={3} />)
    fireEvent.click(screen.getByRole('button', { name: /Ideas/ }))

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Farro Bowl/ })) })
    expect(baseProps.onApplyNewRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Farro Bowl', ingredients: ['1 cup farro'], instructions: ['cook it'], prepMinutes: 25 }),
    )
    expect(baseProps.onPick).not.toHaveBeenCalled()
  })
})
