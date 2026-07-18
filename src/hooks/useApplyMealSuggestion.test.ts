import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useApplyMealSuggestion } from './useApplyMealSuggestion'

// --- Mocks ---

const mockAddMeal = vi.fn().mockResolvedValue(undefined)
const mockRemoveMeal = vi.fn().mockResolvedValue(undefined)

vi.mock('@/hooks/useMealPlan', () => ({
  useMealPlan: () => ({
    addMeal: mockAddMeal,
    removeMeal: mockRemoveMeal,
    plan: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

// ---

const weekStart = new Date('2026-05-19')

describe('useApplyMealSuggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('(a) add: calls addMeal with mapped args', async () => {
    const { result } = renderHook(() => useApplyMealSuggestion(weekStart))

    await act(async () => {
      await result.current.applySuggestion({
        kind: 'add',
        kicker: '',
        title: '',
        why: '',
        apply: { dayOfWeek: 2, slot: 'dinner', adHocTitle: 'Pasta' },
      })
    })

    expect(mockAddMeal).toHaveBeenCalledOnce()
    expect(mockAddMeal).toHaveBeenCalledWith({
      dayOfWeek: 2,
      slot: 'dinner',
      recipeId: undefined,
      adHocTitle: 'Pasta',
    })
    expect(mockRemoveMeal).not.toHaveBeenCalled()
  })

  it('(b) swap with originalEntryId: calls removeMeal(originalEntryId) then addMeal', async () => {
    const { result } = renderHook(() => useApplyMealSuggestion(weekStart))

    await act(async () => {
      await result.current.applySuggestion({
        kind: 'swap',
        kicker: '',
        title: '',
        why: '',
        originalEntryId: 'entry-abc',
        apply: { dayOfWeek: 4, slot: 'lunch', recipeId: 'recipe-xyz' },
      })
    })

    expect(mockRemoveMeal).toHaveBeenCalledOnce()
    expect(mockRemoveMeal).toHaveBeenCalledWith('entry-abc')
    expect(mockAddMeal).toHaveBeenCalledOnce()
    expect(mockAddMeal).toHaveBeenCalledWith({
      dayOfWeek: 4,
      slot: 'lunch',
      recipeId: 'recipe-xyz',
      adHocTitle: undefined,
    })
    // removeMeal must be called before addMeal
    expect(mockRemoveMeal.mock.invocationCallOrder[0]).toBeLessThan(
      mockAddMeal.mock.invocationCallOrder[0],
    )
  })

  it('(c) remove: calls removeMeal(entryId)', async () => {
    const { result } = renderHook(() => useApplyMealSuggestion(weekStart))

    await act(async () => {
      await result.current.applySuggestion({
        kind: 'remove',
        kicker: '',
        title: '',
        why: '',
        apply: { entryId: 'entry-remove-me' },
      })
    })

    expect(mockRemoveMeal).toHaveBeenCalledOnce()
    expect(mockRemoveMeal).toHaveBeenCalledWith('entry-remove-me')
    expect(mockAddMeal).not.toHaveBeenCalled()
  })
})
