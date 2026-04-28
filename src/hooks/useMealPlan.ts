import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  dbMealPlanToMealPlan, type MealPlan, type DbMealPlan, type DbMealPlanEntry,
  type MealParameter, type MealSlot,
} from '@/types/meal-planner'

interface AddMealInput {
  dayOfWeek: number
  slot: MealSlot
  recipeId?: string
  adHocTitle?: string
  notes?: string
}

interface UseMealPlanResult {
  plan: MealPlan | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  addMeal: (input: AddMealInput) => Promise<void>
  removeMeal: (entryId: string) => Promise<void>
  setParameter: (parameter: MealParameter | undefined) => Promise<void>
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function useMealPlan(weekStart: Date): UseMealPlanResult {
  const [plan, setPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const weekStartIso = toIsoDate(weekStart)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: userResult } = await supabase.auth.getUser()
    const userId = userResult?.user?.id
    if (!userId) { setError('not authenticated'); setLoading(false); return }

    const { data: planRow, error: planErr } = await supabase
      .from('meal_plans').select('*').eq('user_id', userId).eq('week_start', weekStartIso).maybeSingle()

    if (planErr) { setError(planErr.message); setLoading(false); return }

    let row = planRow as DbMealPlan | null
    if (!row) {
      const { data: created, error: createErr } = await supabase
        .from('meal_plans').insert({ user_id: userId, week_start: weekStartIso }).select().single()
      if (createErr || !created) { setError(createErr?.message ?? 'create failed'); setLoading(false); return }
      row = created as DbMealPlan
    }

    const { data: entries, error: entryErr } = await supabase
      .from('meal_plan_entries').select('*').eq('meal_plan_id', row.id).order('day_of_week', { ascending: true })

    if (entryErr) { setError(entryErr.message); setLoading(false); return }

    setPlan(dbMealPlanToMealPlan(row, (entries ?? []) as DbMealPlanEntry[]))
    setLoading(false)
  }, [weekStartIso])

  const addMeal = useCallback(async (input: AddMealInput) => {
    if (!plan) return
    const { data, error: insertErr } = await supabase
      .from('meal_plan_entries').insert({
        meal_plan_id: plan.id,
        day_of_week: input.dayOfWeek,
        slot: input.slot,
        recipe_id: input.recipeId ?? null,
        ad_hoc_title: input.adHocTitle ?? null,
        notes: input.notes ?? null,
      }).select().single()
    if (insertErr) { setError(insertErr.message); return }
    if (data) {
      setPlan(prev => prev ? {
        ...prev,
        entries: [...prev.entries, {
          id: data.id, mealPlanId: data.meal_plan_id, dayOfWeek: data.day_of_week,
          slot: data.slot, recipeId: data.recipe_id ?? undefined,
          adHocTitle: data.ad_hoc_title ?? undefined, notes: data.notes ?? undefined,
          leftoverFrom: data.leftover_from ?? undefined,
        }],
      } : prev)
    }
  }, [plan])

  const removeMeal = useCallback(async (entryId: string) => {
    if (!plan) return
    const previous = plan.entries
    setPlan(prev => prev ? { ...prev, entries: prev.entries.filter(e => e.id !== entryId) } : prev)
    const { error: delErr } = await supabase.from('meal_plan_entries').delete().eq('id', entryId)
    if (delErr) {
      setPlan(prev => prev ? { ...prev, entries: previous } : prev)
      setError(delErr.message)
    }
  }, [plan])

  const setParameter = useCallback(async (parameter: MealParameter | undefined) => {
    if (!plan) return
    const previous = plan.parameter
    setPlan(prev => prev ? { ...prev, parameter } : prev)
    const { error: updErr } = await supabase
      .from('meal_plans').update({ parameter: parameter ?? null }).eq('id', plan.id)
    if (updErr) {
      setPlan(prev => prev ? { ...prev, parameter: previous } : prev)
      setError(updErr.message)
    }
  }, [plan])

  useEffect(() => { refresh() }, [refresh])

  return { plan, loading, error, refresh, addMeal, removeMeal, setParameter }
}
