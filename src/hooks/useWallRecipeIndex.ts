import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { WallRecipe } from '@/lib/recipes/search'

interface Result {
  recipes: WallRecipe[]
  loading: boolean
  error: string | null
}

/**
 * Every recipe's NAME, for the wall's picker — deliberately not `useRecipes`.
 *
 * That hook does `select('*')`, which on 143 recipes drags every ingredient
 * list and every instruction across the wire; the wall's egress bill is
 * already the thing to watch (it polls all day). The picker only ever shows a
 * title, so it only ever asks for one. The body arrives later, for the one
 * recipe someone actually taps.
 *
 * Read-only and gated on `enabled` — the same shape as useMealDayRecipes: one
 * query when the sheet opens, no realtime channel, no poll.
 */
export function useWallRecipeIndex(enabled: boolean): Result {
  const [recipes, setRecipes] = useState<WallRecipe[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      const { data, error: err } = await supabase
        .from('recipes')
        .select('id, title, tags, last_cooked_at, prep_minutes')
        .order('title')
      if (cancelled) return
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      const rows = (data ?? []) as {
        id: string; title: string; tags: string[] | null
        last_cooked_at: string | null; prep_minutes: number | null
      }[]
      setRecipes(rows.map((r) => ({
        id: r.id,
        title: r.title,
        tags: r.tags ?? [],
        lastCookedAt: r.last_cooked_at ? new Date(r.last_cooked_at) : null,
        prepMinutes: r.prep_minutes,
      })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [enabled])

  return { recipes, loading, error }
}
