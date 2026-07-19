import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'
import type { MealSlot } from '@/types/meal-planner'

/** One AI-proposed replacement for a slot. `shelf` references an existing
 *  recipe; `new` carries a full recipe payload to save on accept. */
export type SlotSuggestion =
  | { source: 'shelf'; recipeId: string; title: string; why: string }
  | {
      source: 'new'
      title: string
      why: string
      ingredients: string[]
      instructions: string[]
      prepMinutes?: number
      tags?: string[]
    }

export interface SuggestArgs {
  weekStart: Date
  dayOfWeek: number
  slot: MealSlot
  intent: string
}

export interface UseMealSlotSuggestionsResult {
  suggestions: SlotSuggestion[]
  loading: boolean
  error: string | null
  suggest: (args: SuggestArgs) => Promise<void>
  reset: () => void
}

/**
 * Client for the `meal-slot-suggest` edge function: asks for up to 3 AI ideas
 * for one meal slot. Read-only — nothing is written until the user applies a
 * suggestion (the modal does that via its own props).
 */
export function useMealSlotSuggestions(): UseMealSlotSuggestionsResult {
  const [suggestions, setSuggestions] = useState<SlotSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggest = useCallback(async ({ weekStart, dayOfWeek, slot, intent }: SuggestArgs) => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not signed in'); return }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meal-slot-suggest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ weekStart: toIsoDate(weekStart), dayOfWeek, slot, intent }),
      })

      if (!res.ok) {
        const msg = await res.text().catch(() => 'request failed')
        setError(`Couldn't get ideas: ${msg}`)
        setSuggestions([])
        return
      }

      const body = await res.json() as { suggestions?: SlotSuggestion[] }
      setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setSuggestions([])
    setError(null)
    setLoading(false)
  }, [])

  return { suggestions, loading, error, suggest, reset }
}
