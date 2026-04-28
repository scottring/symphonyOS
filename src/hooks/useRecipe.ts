import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbRecipeToRecipe, type Recipe, type DbRecipe, type KidAcceptanceMap } from '@/types/meal-planner'

interface UpdateAcceptanceInput {
  kidAcceptance: KidAcceptanceMap
  sentence: string
}

interface UseRecipeResult {
  recipe: Recipe | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  updateAcceptance: (input: UpdateAcceptanceInput) => Promise<void>
  recordCooked: (outcome?: Record<string, 'loves' | 'eats' | 'rejects' | 'skipped'>) => Promise<void>
}

export function useRecipe(id: string | null): UseRecipeResult {
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!id) { setRecipe(null); setLoading(false); return }
    setLoading(true)
    setError(null)
    const { data, error: fetchErr } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', id)
      .single()
    if (fetchErr) { setError(fetchErr.message); setLoading(false); return }
    setRecipe(dbRecipeToRecipe(data as DbRecipe))
    setLoading(false)
  }, [id])

  const updateAcceptance = useCallback(async (input: UpdateAcceptanceInput) => {
    if (!id) return
    const previous = recipe
    setRecipe(prev => prev
      ? { ...prev, kidAcceptance: input.kidAcceptance, acceptanceSentence: input.sentence }
      : prev)
    const { error: updErr } = await supabase
      .from('recipes')
      .update({ kid_acceptance: input.kidAcceptance, acceptance_sentence: input.sentence })
      .eq('id', id)
    if (updErr) { setRecipe(previous); setError(updErr.message) }
  }, [id, recipe])

  const recordCooked = useCallback(async (
    outcome: Record<string, 'loves' | 'eats' | 'rejects' | 'skipped'> = {},
  ) => {
    if (!id) return
    const { data: userResult } = await supabase.auth.getUser()
    const userId = userResult?.user?.id
    if (!userId) return
    await supabase.from('cooking_history').insert({
      user_id: userId,
      recipe_id: id,
      outcome,
    })
    await supabase
      .from('recipes')
      .update({
        times_cooked: (recipe?.timesCooked ?? 0) + 1,
        last_cooked_at: new Date().toISOString(),
      })
      .eq('id', id)
    refresh()
  }, [id, recipe, refresh])

  useEffect(() => { refresh() }, [refresh])

  return { recipe, loading, error, refresh, updateAcceptance, recordCooked }
}
