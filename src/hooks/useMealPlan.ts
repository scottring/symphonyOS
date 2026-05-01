import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'
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
  /** NULL/undefined = family-default. Otherwise a family_members.id. */
  familyMemberId?: string | null
  /** NULL/undefined = not a leftover. Otherwise the meal_plan_entries.id of the parent batch. */
  leftoverFromId?: string | null
  /** NULL/undefined = unassigned. Otherwise a family_members.id. */
  preparedByFamilyMemberId?: string | null
}

interface UseMealPlanResult {
  plan: MealPlan | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  addMeal: (input: AddMealInput) => Promise<void>
  removeMeal: (entryId: string) => Promise<void>
  setParameter: (parameter: MealParameter | undefined) => Promise<void>
  updateMealPreparer: (entryId: string, preparedByFamilyMemberId: string | null) => Promise<void>
  clearWeek: () => Promise<{ ok: boolean; tokenId?: string; error?: string }>
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

    // RLS handles household visibility — query by week_start only. If multiple
    // household members each created a plan, the oldest wins (deterministic).
    const { data: planRows, error: planErr } = await supabase
      .from('meal_plans').select('*')
      .eq('week_start', weekStartIso)
      .order('created_at', { ascending: true })
      .limit(1)

    if (planErr) { setError(planErr.message); setLoading(false); return }

    let row = (planRows && planRows[0]) as DbMealPlan | null
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
        family_member_id: input.familyMemberId ?? null,
        leftover_from: input.leftoverFromId ?? null,
        prepared_by_family_member_id: input.preparedByFamilyMemberId ?? null,
      }).select().single()
    if (insertErr) {
      setError(insertErr.message)
      // Surface the DB error to callers so try/catch in handlers (e.g.
      // Ask-Symphony's onApplySuggestion) can show feedback.
      throw new Error(`addMeal failed: ${insertErr.message}`)
    }
    if (data) {
      setPlan(prev => prev ? {
        ...prev,
        entries: [...prev.entries, {
          id: data.id, mealPlanId: data.meal_plan_id, dayOfWeek: data.day_of_week,
          slot: data.slot, recipeId: data.recipe_id ?? undefined,
          adHocTitle: data.ad_hoc_title ?? undefined, notes: data.notes ?? undefined,
          leftoverFrom: data.leftover_from ?? undefined,
          trackingState: (data.tracking_state ?? 'as_planned'),
          swapTitle: data.swap_title ?? undefined,
          swapGrams: data.swap_grams ?? undefined,
          actualGrams: data.actual_grams ?? undefined,
          familyMemberId: data.family_member_id ?? undefined,
          preparedBy: data.prepared_by_family_member_id ?? null,
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

  const updateMealPreparer = useCallback(async (entryId: string, preparedByFamilyMemberId: string | null) => {
    if (!plan) return
    // Optimistic update
    const previous = plan.entries
    setPlan(prev => prev ? {
      ...prev,
      entries: prev.entries.map(e => e.id === entryId ? { ...e, preparedBy: preparedByFamilyMemberId } : e),
    } : prev)
    const { error: updErr } = await supabase
      .from('meal_plan_entries')
      .update({ prepared_by_family_member_id: preparedByFamilyMemberId })
      .eq('id', entryId)
    if (updErr) {
      setPlan(prev => prev ? { ...prev, entries: previous } : prev)
      setError(updErr.message)
    }
  }, [plan])

  const clearWeek = useCallback(async (): Promise<{ ok: boolean; tokenId?: string; error?: string }> => {
    if (!plan) return { ok: false, error: 'no plan loaded' }
    // Snapshot for undo
    const { data: prior, error: snapErr } = await supabase
      .from('meal_plan_entries').select('*').eq('meal_plan_id', plan.id)
    if (snapErr) return { ok: false, error: snapErr.message }
    // Wipe via RPC (acquires row lock; serializes concurrent writers)
    const { error: rpcErr } = await supabase.rpc('regenerate_meal_plan', {
      p_meal_plan_id: plan.id, p_entries: [],
    })
    if (rpcErr) return { ok: false, error: rpcErr.message }
    // Persist undo token
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const { data: tokenRow, error: tokenErr } = await supabase.from('ai_undo_tokens').insert({
      user_id: userId,
      description: `Cleared week of ${weekStartIso}`,
      inverse_actions: [
        { type: 'restore_meal_plan_entries', payload: { rows: prior ?? [] } },
      ],
      expires_at: expiresAt,
    }).select('id').single()
    await refresh()
    if (tokenErr) {
      // Wipe succeeded but undo token didn't — surface as ok-but-no-undo
      return { ok: true }
    }
    return { ok: true, tokenId: tokenRow?.id }
  }, [plan, refresh, weekStartIso])

  useEffect(() => { refresh() }, [refresh])

  return { plan, loading, error, refresh, addMeal, removeMeal, setParameter, updateMealPreparer, clearWeek }
}
