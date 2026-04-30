import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbStandingHabitToStandingHabit, type StandingHabit, type DbStandingHabit } from '@/types/meal-planner'

interface AddInput {
  name: string
  slot: StandingHabit['slot']
  gramsHint?: number
}

interface UpdateInput {
  name?: string
  slot?: StandingHabit['slot']
  gramsHint?: number | null
  paused?: boolean
  sortOrder?: number
}

interface UseStandingHabitsResult {
  habits: StandingHabit[]
  loading: boolean
  error: string | null
  add: (input: AddInput) => Promise<void>
  update: (id: string, input: UpdateInput) => Promise<void>
  remove: (id: string) => Promise<void>
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

    setHabits(prev => prev.map(h => h.id === id ? {
      ...h,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slot !== undefined ? { slot: input.slot } : {}),
      ...(input.gramsHint !== undefined ? { gramsHint: input.gramsHint ?? undefined } : {}),
      ...(input.paused !== undefined ? { paused: input.paused } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    } : h))

    const { error: updErr } = await supabase
      .from('standing_habits')
      .update(patch)
      .eq('id', id)
    if (updErr) { setHabits(previous); setError(updErr.message) }
  }, [habits])

  const remove = useCallback(async (id: string) => {
    const previous = habits
    setHabits(prev => prev.filter(h => h.id !== id))
    const { error: delErr } = await supabase.from('standing_habits').delete().eq('id', id)
    if (delErr) { setHabits(previous); setError(delErr.message) }
  }, [habits])

  useEffect(() => { refresh() }, [refresh])

  return { habits, loading, error, add, update, remove, refresh }
}
