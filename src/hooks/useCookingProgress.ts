import { useCallback, useEffect, useState } from 'react'

/**
 * Local-state hook tracking which step indices are checked off during
 * a cooking session. Not yet persisted to the backend — purely in-memory
 * for the lifetime of the CookPage. Resets when `recipeId` changes so
 * each recipe gets a fresh progress slate.
 */
interface UseCookingProgressResult {
  checked: Set<number>
  isChecked: (index: number) => boolean
  toggle: (index: number) => void
  reset: () => void
}

export function useCookingProgress(recipeId: string | undefined): UseCookingProgressResult {
  const [checked, setChecked] = useState<Set<number>>(() => new Set())

  // Reset when switching recipes.
  useEffect(() => {
    setChecked(new Set())
  }, [recipeId])

  const isChecked = useCallback((index: number) => checked.has(index), [checked])

  const toggle = useCallback((index: number) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const reset = useCallback(() => setChecked(new Set()), [])

  return { checked, isChecked, toggle, reset }
}
