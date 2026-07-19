import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'
import { useAuth } from '@/hooks/useAuth'
import {
  dbMealPlanToMealPlan, type MealPlan, type DbMealPlan, type DbMealPlanEntry,
  type MealSlot,
} from '@/types/meal-planner'

interface AddMealInput {
  dayOfWeek: number
  slot: MealSlot
  recipeId?: string
  adHocTitle?: string
  notes?: string
  /** NULL/undefined = not a leftover. Otherwise the meal_plan_entries.id of the parent batch. */
  leftoverFromId?: string | null
  /** NULL/undefined = shared/whole-family meal; a family_members.id = that person's variant. */
  forMemberId?: string | null
}

interface UseMealPlanResult {
  plan: MealPlan | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  addMeal: (input: AddMealInput) => Promise<void>
  removeMeal: (entryId: string) => Promise<void>
  /** Move an entry to a different day/slot. If the target cell is occupied,
   *  the two entries swap places. */
  moveMeal: (entryId: string, targetDayOfWeek: number, targetSlot: MealSlot) => Promise<void>
  setWeekRange: (startsOn: string | null, endsOn: string | null) => Promise<void>
}

// Unique per-mount channel names — same-topic channels conflict in supabase-js.
let mealPlanChannelSeq = 0

export function useMealPlan(weekStart: Date): UseMealPlanResult {
  const [plan, setPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const weekStartIso = toIsoDate(weekStart)
  const { user } = useAuth()

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
        leftover_from: input.leftoverFromId ?? null,
        for_member_id: input.forMemberId ?? null,
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
          forMemberId: data.for_member_id ?? undefined,
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

  const moveMeal = useCallback(async (entryId: string, targetDayOfWeek: number, targetSlot: MealSlot) => {
    if (!plan) return
    const source = plan.entries.find(e => e.id === entryId)
    if (!source) return
    if (source.dayOfWeek === targetDayOfWeek && source.slot === targetSlot) return
    // Swap when the target cell already holds a meal, otherwise a plain move.
    const target = plan.entries.find(e => e.dayOfWeek === targetDayOfWeek && e.slot === targetSlot)

    const previous = plan.entries
    setPlan(prev => prev ? {
      ...prev,
      entries: prev.entries.map(e => {
        if (e.id === source.id) return { ...e, dayOfWeek: targetDayOfWeek, slot: targetSlot }
        if (target && e.id === target.id) return { ...e, dayOfWeek: source.dayOfWeek, slot: source.slot }
        return e
      }),
    } : prev)

    const updates = [
      supabase.from('meal_plan_entries').update({ day_of_week: targetDayOfWeek, slot: targetSlot }).eq('id', source.id),
    ]
    // No unique (plan, day, slot) constraint exists, so the two updates can run
    // without a temp value even though they briefly share a cell.
    if (target) {
      updates.push(
        supabase.from('meal_plan_entries').update({ day_of_week: source.dayOfWeek, slot: source.slot }).eq('id', target.id),
      )
    }
    const results = await Promise.all(updates)
    const failed = results.find(r => r.error)
    if (failed?.error) {
      setPlan(prev => prev ? { ...prev, entries: previous } : prev)
      setError(failed.error.message)
    }
  }, [plan])

  const setWeekRange = useCallback(async (startsOn: string | null, endsOn: string | null) => {
    if (!plan) return
    const prev = { startsOn: plan.startsOn, endsOn: plan.endsOn }
    setPlan(p => p ? { ...p, startsOn, endsOn } : p)
    const { error: updErr } = await supabase.from('meal_plans')
      .update({ starts_on: startsOn, ends_on: endsOn })
      .eq('id', plan.id)
    if (updErr) {
      setPlan(p => p ? { ...p, ...prev } : p)
      setError(updErr.message)
    }
  }, [plan])

  // Refetch on mount and when the week changes.
  useEffect(() => { refresh() }, [refresh])

  // Per-instance realtime subscription: any change to meal_plan_entries
  // refetches this hook's plan. refreshRef avoids resubscribing on every
  // refresh() identity change. Later tasks (chat, wall) rely on this instead
  // of the old shared refresh-signal context.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`meal-plan-changes-${++mealPlanChannelSeq}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'meal_plan_entries' },
        () => { void refreshRef.current() })
      // Range changes (starts_on/ends_on) land on the plan row itself — e.g.
      // the chat edge function's set_week_range tool.
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meal_plans' },
        () => { void refreshRef.current() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  return { plan, loading, error, refresh, addMeal, removeMeal, moveMeal, setWeekRange }
}
