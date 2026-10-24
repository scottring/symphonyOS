import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'
import { positionOf, storageFor, windowWeeks } from '@/lib/mealWeek'
import { useAuth } from '@/hooks/useAuth'
import { showToast } from '@/hooks/useToast'
import {
  dbMealPlanToMealPlan, type MealPlan, type DbMealPlan, type DbMealPlanEntry,
  type MealSlot,
} from '@/types/meal-planner'

interface AddMealInput {
  /** The day's position in the window (0 = its first day); see mealWeek.ts. */
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
  /** The window as one plan: the anchor week's id and range, and every meal
   *  in the window with `dayOfWeek` as its position (0 = the first day). */
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

const parseIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Unique per-mount channel names — same-topic channels conflict in supabase-js.
let mealPlanChannelSeq = 0

/** The oldest plan for a Sunday week, or null. RLS handles household
 *  visibility; when several members each created one, the oldest wins. */
async function oldestPlan(weekStart: string): Promise<{ row: DbMealPlan | null; error: string | null }> {
  const { data, error } = await supabase
    .from('meal_plans').select('*')
    .eq('week_start', weekStart)
    .order('created_at', { ascending: true })
    .limit(1)
  return { row: ((data && data[0]) as DbMealPlan | undefined) ?? null, error: error?.message ?? null }
}

/** `windowStart` is the page's first day, on the household's week start.
 *  Meals are stored under the Sunday week of their date (mealWeek.ts). */
export function useMealPlan(windowStart: Date): UseMealPlanResult {
  const [plan, setPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const windowIso = toIsoDate(windowStart)
  const { user } = useAuth()
  // The stored plan id for each Sunday week the window draws on.
  const planIds = useRef(new Map<string, string>())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: userResult } = await getAuthUser()
    const userId = userResult?.user?.id
    if (!userId) { setError('not authenticated'); setLoading(false); return }

    const start = parseIso(windowIso)
    const { weeks, anchor } = windowWeeks(start)
    const ids = new Map<string, string>()
    let anchorRow: DbMealPlan | null = null
    for (const week of weeks) {
      const found = await oldestPlan(week)
      if (found.error) { setError(found.error); setLoading(false); return }
      let row = found.row
      // The anchor week's plan is made on first look, as before; the other
      // week's only when a meal is put on one of its days.
      if (!row && week === anchor) {
        const { data: created, error: createErr } = await supabase
          .from('meal_plans').insert({ user_id: userId, week_start: week }).select().single()
        if (createErr || !created) { setError(createErr?.message ?? 'create failed'); setLoading(false); return }
        row = created as DbMealPlan
      }
      if (row) ids.set(week, row.id)
      if (week === anchor) anchorRow = row
    }
    if (!anchorRow) { setError('create failed'); setLoading(false); return }

    const weekOfPlan = new Map([...ids].map(([week, id]) => [id, week]))
    const { data: entries, error: entryErr } = await supabase
      .from('meal_plan_entries').select('*').in('meal_plan_id', [...ids.values()]).order('day_of_week', { ascending: true })

    if (entryErr) { setError(entryErr.message); setLoading(false); return }

    // Each meal at its position in the window; the far end of a partly
    // covered Sunday week belongs to the window before or after.
    const inWindow = ((entries ?? []) as DbMealPlanEntry[]).flatMap((e) => {
      const position = positionOf(start, weekOfPlan.get(e.meal_plan_id) ?? '', e.day_of_week)
      return position == null ? [] : [{ ...e, day_of_week: position }]
    }).sort((a, b) => a.day_of_week - b.day_of_week)
    planIds.current = ids
    setPlan({ ...dbMealPlanToMealPlan(anchorRow, inWindow), weekStart: start })
    setLoading(false)
  }, [windowIso])

  /** The stored plan for a position, made when that week has none yet. */
  const planFor = useCallback(async (position: number): Promise<{ planId: string; dayOfWeek: number } | null> => {
    const at = storageFor(parseIso(windowIso), position)
    const known = planIds.current.get(at.weekStart)
    if (known) return { planId: known, dayOfWeek: at.dayOfWeek }
    const found = await oldestPlan(at.weekStart)
    let id = found.row?.id
    if (!id) {
      const { data: userResult } = await getAuthUser()
      const userId = userResult?.user?.id
      if (!userId) return null
      const { data: created } = await supabase
        .from('meal_plans').insert({ user_id: userId, week_start: at.weekStart }).select().single()
      id = (created as DbMealPlan | null)?.id
    }
    if (!id) return null
    planIds.current.set(at.weekStart, id)
    return { planId: id, dayOfWeek: at.dayOfWeek }
  }, [windowIso])

  const addMeal = useCallback(async (input: AddMealInput) => {
    if (!plan) return
    const stored = await planFor(input.dayOfWeek)
    if (!stored) {
      showToast("Couldn't add that meal. Please try again.", 'error')
      throw new Error('addMeal failed: no plan for that day')
    }
    const { data, error: insertErr } = await supabase
      .from('meal_plan_entries').insert({
        meal_plan_id: stored.planId,
        day_of_week: stored.dayOfWeek,
        slot: input.slot,
        recipe_id: input.recipeId ?? null,
        ad_hoc_title: input.adHocTitle ?? null,
        notes: input.notes ?? null,
        leftover_from: input.leftoverFromId ?? null,
        for_member_id: input.forMemberId ?? null,
      }).select().single()
    if (insertErr) {
      // A write failure is a toast, not the page-wide `error`: that one is
      // for a failed load and hides the whole grid until the week changes.
      showToast("Couldn't add that meal. Please try again.", 'error')
      // Surface the DB error to callers so try/catch in handlers (e.g.
      // Ask-Symphony's onApplySuggestion) can show feedback.
      throw new Error(`addMeal failed: ${insertErr.message}`)
    }
    if (data) {
      setPlan(prev => prev ? {
        ...prev,
        entries: [...prev.entries, {
          id: data.id, mealPlanId: data.meal_plan_id, dayOfWeek: input.dayOfWeek,
          slot: data.slot, recipeId: data.recipe_id ?? undefined,
          adHocTitle: data.ad_hoc_title ?? undefined, notes: data.notes ?? undefined,
          leftoverFrom: data.leftover_from ?? undefined,
          forMemberId: data.for_member_id ?? undefined,
        }],
      } : prev)
    }
  }, [plan, planFor])

  const removeMeal = useCallback(async (entryId: string) => {
    if (!plan) return
    const previous = plan.entries
    setPlan(prev => prev ? { ...prev, entries: prev.entries.filter(e => e.id !== entryId) } : prev)
    const { error: delErr } = await supabase.from('meal_plan_entries').delete().eq('id', entryId)
    if (delErr) {
      setPlan(prev => prev ? { ...prev, entries: previous } : prev)
      showToast("Couldn't remove that meal.", 'error')
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

    // A move can cross from one stored Sunday week into the other.
    const [to, from] = await Promise.all([planFor(targetDayOfWeek), target ? planFor(source.dayOfWeek) : null])
    const updates = to ? [
      supabase.from('meal_plan_entries').update({ meal_plan_id: to.planId, day_of_week: to.dayOfWeek, slot: targetSlot }).eq('id', source.id),
    ] : []
    // No unique (plan, day, slot) constraint exists, so the two updates can run
    // without a temp value even though they briefly share a cell.
    if (target && from) {
      updates.push(
        supabase.from('meal_plan_entries').update({ meal_plan_id: from.planId, day_of_week: from.dayOfWeek, slot: source.slot }).eq('id', target.id),
      )
    }
    const results = await Promise.all(updates)
    const failed = !to || (target && !from) || results.some(r => r.error)
    if (failed) {
      setPlan(prev => prev ? { ...prev, entries: previous } : prev)
      showToast("Couldn't move that meal.", 'error')
    }
  }, [plan, planFor])

  const setWeekRange = useCallback(async (startsOn: string | null, endsOn: string | null) => {
    if (!plan) return
    const prev = { startsOn: plan.startsOn, endsOn: plan.endsOn }
    setPlan(p => p ? { ...p, startsOn, endsOn } : p)
    const { error: updErr } = await supabase.from('meal_plans')
      .update({ starts_on: startsOn, ends_on: endsOn })
      .eq('id', plan.id)
    if (updErr) {
      setPlan(p => p ? { ...p, ...prev } : p)
      showToast("Couldn't change the week's range.", 'error')
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
