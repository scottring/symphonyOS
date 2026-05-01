import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbStandingHabitToStandingHabit, type StandingHabit, type DbStandingHabit } from '@/types/meal-planner'

interface AddInput {
  name: string
  slot: StandingHabit['slot']
  gramsHint?: number
  assignedFamilyMemberId?: string | null
}

interface UpdateInput {
  name?: string
  slot?: StandingHabit['slot']
  gramsHint?: number | null
  paused?: boolean
  sortOrder?: number
  pausedForWeeks?: string[]
  assignedFamilyMemberId?: string | null
}

interface UseStandingHabitsResult {
  habits: StandingHabit[]
  loading: boolean
  error: string | null
  add: (input: AddInput) => Promise<void>
  update: (id: string, input: UpdateInput) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleWeekPause: (habitId: string, weekStartIso: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useStandingHabits(): UseStandingHabitsResult {
  const [habits, setHabits] = useState<StandingHabit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    // RLS handles household visibility — fetch all habits the current user
    // can see (own + household members'). Each row's user_id distinguishes
    // ownership for editing.
    const { data, error: fetchErr } = await supabase
      .from('standing_habits')
      .select('*')
      .order('sort_order', { ascending: true })
    if (fetchErr) { setError(fetchErr.message); setLoading(false); return }
    setHabits((data ?? []).map(r => dbStandingHabitToStandingHabit(r as DbStandingHabit)))
    setLoading(false)
  }, [])

  const add = useCallback(async (input: AddInput) => {
    const { data: userResult } = await supabase.auth.getUser()
    const userId = userResult?.user?.id
    if (!userId) { setError('not authenticated'); return }
    const nextOrder = habits.length > 0
      ? Math.max(...habits.map(h => h.sortOrder)) + 1
      : 0
    const { data, error: insertErr } = await supabase
      .from('standing_habits')
      .insert({
        user_id: userId,
        name: input.name,
        slot: input.slot,
        grams_hint: input.gramsHint ?? null,
        sort_order: nextOrder,
        assigned_family_member_id: input.assignedFamilyMemberId ?? null,
      })
      .select()
      .single()
    if (insertErr || !data) { setError(insertErr?.message ?? 'insert failed'); return }
    setHabits(prev => [...prev, dbStandingHabitToStandingHabit(data as DbStandingHabit)])
  }, [habits])

  const update = useCallback(async (id: string, input: UpdateInput) => {
    const previous = habits
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.slot !== undefined) patch.slot = input.slot
    if (input.gramsHint !== undefined) patch.grams_hint = input.gramsHint
    if (input.paused !== undefined) patch.paused = input.paused
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
    if (input.pausedForWeeks !== undefined) patch.paused_for_weeks = input.pausedForWeeks
    if (input.assignedFamilyMemberId !== undefined) patch.assigned_family_member_id = input.assignedFamilyMemberId

    setHabits(prev => prev.map(h => h.id === id ? {
      ...h,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slot !== undefined ? { slot: input.slot } : {}),
      ...(input.gramsHint !== undefined ? { gramsHint: input.gramsHint ?? undefined } : {}),
      ...(input.paused !== undefined ? { paused: input.paused } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.pausedForWeeks !== undefined ? { pausedForWeeks: input.pausedForWeeks } : {}),
      ...(input.assignedFamilyMemberId !== undefined ? { assignedFamilyMemberId: input.assignedFamilyMemberId } : {}),
    } : h))

    const { error: updErr } = await supabase
      .from('standing_habits')
      .update(patch)
      .eq('id', id)
    if (updErr) { setHabits(previous); setError(updErr.message) }
  }, [habits])

  const toggleWeekPause = useCallback(async (habitId: string, weekStartIso: string) => {
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return
    const has = habit.pausedForWeeks.includes(weekStartIso)
    const next = has
      ? habit.pausedForWeeks.filter(w => w !== weekStartIso)
      : [...habit.pausedForWeeks, weekStartIso]
    const previous = habits
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, pausedForWeeks: next } : h))
    const { error: updErr } = await supabase
      .from('standing_habits')
      .update({ paused_for_weeks: next })
      .eq('id', habitId)
    if (updErr) { setHabits(previous); setError(updErr.message); return }
    await refresh()
  }, [habits, refresh])

  const remove = useCallback(async (id: string) => {
    const previous = habits
    setHabits(prev => prev.filter(h => h.id !== id))
    const { error: delErr } = await supabase.from('standing_habits').delete().eq('id', id)
    if (delErr) { setHabits(previous); setError(delErr.message) }
  }, [habits])

  useEffect(() => { refresh() }, [refresh])

  return { habits, loading, error, add, update, remove, toggleWeekPause, refresh }
}
