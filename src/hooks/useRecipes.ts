import { useEffect, useState, useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { fetchRecipe } from '@/lib/recipeParser'
import { recipeDataToInsertRow } from '@/lib/recipeDataMapper'
import { dbRecipeToRecipe, type Recipe, type DbRecipe } from '@/types/meal-planner'

export type RecipeSort = 'recently_cooked' | 'recently_added' | 'never_cooked'
export type RecipeFilter = 'all' | 'quick' | 'kids_eat' | 'never_cooked' | 'prep_friendly'

interface UseRecipesResult {
  recipes: Recipe[]
  loading: boolean
  error: string | null
  sort: RecipeSort
  filter: RecipeFilter
  setSort: (sort: RecipeSort) => void
  setFilter: (filter: RecipeFilter) => void
  addByUrl: (url: string) => Promise<Recipe>
  addManual: (data: ManualRecipeInput) => Promise<Recipe>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

export interface ManualRecipeInput {
  title: string
  ingredients: string[]
  instructions: string[]
  prepMinutes?: number
  sourceLabel?: string
  imageUrl?: string
  tags?: string[]
  acceptanceSentence?: string
  isPrepFriendly?: boolean
}

export function useRecipes(): UseRecipesResult {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<RecipeSort>('recently_cooked')
  const [filter, setFilter] = useState<RecipeFilter>('all')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchErr } = await supabase
      .from('recipes')
      .select('*')
      .order(sortColumn(sort), { ascending: false, nullsFirst: false })
    if (fetchErr) {
      setError(fetchErr.message)
      setLoading(false)
      return
    }
    let rows = (data ?? []) as DbRecipe[]
    rows = applyFilter(rows, filter)
    setRecipes(rows.map(dbRecipeToRecipe))
    setLoading(false)
  }, [sort, filter])

  const addByUrl = useCallback(async (url: string): Promise<Recipe> => {
    const { data: userResult } = await getAuthUser()
    const userId = userResult?.user?.id
    if (!userId) throw new Error('not authenticated')

    const recipeData = await fetchRecipe(url)
    const row = recipeDataToInsertRow(recipeData, userId)

    const { data, error: insertErr } = await supabase
      .from('recipes')
      .insert(row)
      .select()
      .single()

    if (insertErr || !data) throw new Error(insertErr?.message ?? 'insert failed')
    const recipe = dbRecipeToRecipe(data as DbRecipe)
    setRecipes(prev => [recipe, ...prev])
    return recipe
  }, [])

  const addManual = useCallback(async (input: ManualRecipeInput): Promise<Recipe> => {
    const { data: userResult } = await getAuthUser()
    const userId = userResult?.user?.id
    if (!userId) throw new Error('not authenticated')

    const row = {
      user_id: userId,
      title: input.title,
      source_url: null,
      source_label: input.sourceLabel ?? null,
      image_url: input.imageUrl ?? null,
      prep_minutes: input.prepMinutes ?? null,
      ingredients: input.ingredients,
      instructions: input.instructions,
      tags: input.tags ?? [],
      kid_acceptance: {},
      acceptance_sentence: input.acceptanceSentence ?? null,
      is_prep_friendly: input.isPrepFriendly ?? false,
      times_cooked: 0,
      last_cooked_at: null,
      streak_note: null,
    }

    const { data, error: insertErr } = await supabase
      .from('recipes')
      .insert(row)
      .select()
      .single()

    if (insertErr || !data) throw new Error(insertErr?.message ?? 'insert failed')
    const recipe = dbRecipeToRecipe(data as DbRecipe)
    setRecipes(prev => [recipe, ...prev])
    return recipe
  }, [])

  const remove = useCallback(async (id: string) => {
    const previous = recipes
    setRecipes(prev => prev.filter(r => r.id !== id))
    const { error: delErr } = await supabase.from('recipes').delete().eq('id', id)
    if (delErr) {
      setRecipes(previous)
      setError(delErr.message)
    }
  }, [recipes])

  useEffect(() => { refresh() }, [refresh])

  return { recipes, loading, error, sort, filter, setSort, setFilter, addByUrl, addManual, remove, refresh }
}

function sortColumn(sort: RecipeSort): string {
  switch (sort) {
    case 'recently_cooked': return 'last_cooked_at'
    case 'recently_added':  return 'created_at'
    case 'never_cooked':    return 'created_at'
  }
}

function applyFilter(rows: DbRecipe[], filter: RecipeFilter): DbRecipe[] {
  switch (filter) {
    case 'all': return rows
    case 'quick': return rows.filter(r => r.prep_minutes != null && r.prep_minutes <= 30)
    case 'kids_eat':
      return rows.filter(r => {
        const acceptance = r.kid_acceptance as Record<string, { level: string }>
        const levels = Object.values(acceptance).map(a => a.level)
        return levels.length > 0 && levels.every(l => l === 'loves' || l === 'eats')
      })
    case 'never_cooked': return rows.filter(r => !r.last_cooked_at)
    case 'prep_friendly': return rows.filter(r => r.is_prep_friendly)
  }
}
