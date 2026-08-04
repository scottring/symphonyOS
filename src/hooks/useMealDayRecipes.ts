// Loads the ±1 week of meal-plan days the kiosk recipe viewer pages through.
//
// Deliberately NOT built on useMealPlan: that hook CREATES a meal_plans row for
// any week it's pointed at, opens a realtime channel per instance, and only
// covers one week. Paging needs three weeks, read-only, and only while the
// viewer is actually open — so this is a plain gated fetch.
//
// Three small queries (plans → entries → the referenced recipes), all RLS-scoped
// like every other client read, and none of them run until `enabled` is true.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  buildMealDayRecipes,
  weekStartsCovering,
  type MealDayRecipe,
} from '@/lib/mealDayRecipes'
import {
  dbMealPlanToMealPlan,
  dbRecipeToRecipe,
  type DbMealPlan,
  type DbMealPlanEntry,
  type DbRecipe,
  type MealPlan,
  type MealSlot,
  type Recipe,
} from '@/types/meal-planner'

interface UseMealDayRecipesResult {
  days: MealDayRecipe[]
  loading: boolean
  error: string | null
}

export function useMealDayRecipes(
  centerDate: Date,
  slot: MealSlot,
  enabled: boolean,
): UseMealDayRecipesResult {
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable string key — a Date identity would refetch on every clock tick.
  const weekStarts = useMemo(() => weekStartsCovering(centerDate), [centerDate])
  const weekStartsKey = weekStarts.join(',')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const weeks = weekStartsKey.split(',')

    async function load() {
      setLoading(true)
      setError(null)

      const { data: planRows, error: planErr } = await supabase
        .from('meal_plans').select('*')
        .in('week_start', weeks)
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (planErr) { setError(planErr.message); setLoading(false); return }

      const rows = (planRows ?? []) as DbMealPlan[]
      if (rows.length === 0) {
        setPlans([]); setRecipes([]); setLoading(false); return
      }

      // Ordered by created_at because a day can hold more than one dinner entry
      // (a main plus a side salad). Oldest-first makes the pick deterministic
      // across loads, and seeding writes the main dish first.
      const { data: entryRows, error: entryErr } = await supabase
        .from('meal_plan_entries').select('*')
        .in('meal_plan_id', rows.map((r) => r.id))
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (entryErr) { setError(entryErr.message); setLoading(false); return }

      const entries = (entryRows ?? []) as DbMealPlanEntry[]
      const byPlan = new Map<string, DbMealPlanEntry[]>()
      for (const e of entries) {
        const list = byPlan.get(e.meal_plan_id)
        if (list) list.push(e)
        else byPlan.set(e.meal_plan_id, [e])
      }

      const recipeIds = [...new Set(entries.map((e) => e.recipe_id).filter((id): id is string => !!id))]
      let loadedRecipes: Recipe[] = []
      if (recipeIds.length > 0) {
        const { data: recipeRows, error: recipeErr } = await supabase
          .from('recipes').select('*').in('id', recipeIds)
        if (cancelled) return
        if (recipeErr) { setError(recipeErr.message); setLoading(false); return }
        loadedRecipes = ((recipeRows ?? []) as DbRecipe[]).map(dbRecipeToRecipe)
      }

      setPlans(rows.map((r) => dbMealPlanToMealPlan(r, byPlan.get(r.id) ?? [])))
      setRecipes(loadedRecipes)
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [enabled, weekStartsKey])

  const days = useMemo(
    () => (enabled ? buildMealDayRecipes({ plans, recipes, centerDate, slot }) : []),
    [enabled, plans, recipes, centerDate, slot],
  )

  return { days, loading, error }
}
