// The steps and ingredients cooking mode shows — the same content
// WallRecipeViewer shows: a stored recipe's ingredients/instructions, else
// the recipe page parsed by fetchRecipe (the fetch-recipe edge function).

import { useEffect, useState } from 'react'
import { useRecipe } from '@/hooks/useRecipe'
import { fetchRecipe } from '@/lib/recipeParser'
import type { CookingSource } from '@/lib/wall/activity/kioskActivity'

export interface CookingRecipe {
  title: string
  ingredients: string[]
  instructions: string[]
  servings: string | null
}

export function useCookingRecipe(source: CookingSource | null): { recipe: CookingRecipe | null; loading: boolean; error: string | null } {
  const { recipe: stored, loading: storedLoading, error: storedError } = useRecipe(source?.recipeId ?? null)
  const url = !source?.recipeId && !source?.inline ? source?.url ?? null : null
  const [web, setWeb] = useState<{ url: string; recipe: CookingRecipe | null; error: string | null } | null>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetchRecipe(url).then(
      (r) => { if (!cancelled) setWeb({ url, recipe: { title: r.title, ingredients: r.ingredients, instructions: r.instructions, servings: r.servings ?? null }, error: null }) },
      (e: unknown) => { if (!cancelled) setWeb({ url, recipe: null, error: e instanceof Error ? e.message : 'Couldn’t load the recipe' }) },
    )
    return () => { cancelled = true }
  }, [url])

  if (!source) return { recipe: null, loading: false, error: null }
  if (source.inline) return { recipe: { ...source.inline, servings: null }, loading: false, error: null }
  if (source.recipeId) {
    if (storedLoading) return { recipe: null, loading: true, error: null }
    if (storedError || !stored) return { recipe: null, loading: false, error: storedError ?? 'Recipe not found' }
    return { recipe: { title: stored.title, ingredients: stored.ingredients, instructions: stored.instructions, servings: null }, loading: false, error: null }
  }
  if (!url) return { recipe: null, loading: false, error: 'No recipe to cook from' }
  if (!web || web.url !== url) return { recipe: null, loading: true, error: null }
  return { recipe: web.recipe, loading: false, error: web.error }
}
