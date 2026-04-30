import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'
import { dbMealDayLogToMealDayLog, type MealDayLog, type HabitMap } from '@/types/meal-planner'

interface UpdateInput {
  notes?: string | null
  weightLb?: number | null
  weightNote?: string | null
  habits?: HabitMap
}

interface UseMealDayLogResult {
  log: MealDayLog | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  update: (input: UpdateInput) => Promise<void>
  toggleHabit: (key: string, value?: boolean) => Promise<void>
}

export function useMealDayLog(date: Date): UseMealDayLogResult {
  const [log, setLog] = useState<MealDayLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dateIso = toIsoDate(date)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: userResult } = await supabase.auth.getUser()
    const userId = userResult?.user?.id
    if (!userId) { setError('not authenticated'); setLoading(false); return }

    const { data, error: fetchErr } = await supabase
      .from('meal_day_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('log_date', dateIso)
      .maybeSingle()

    if (fetchErr) { setError(fetchErr.message); setLoading(false); return }

    if (data) {
      setLog(dbMealDayLogToMealDayLog(data))
    } else {
      setLog(null)
    }
    setLoading(false)
  }, [dateIso])

  const ensureLog = useCallback(async (): Promise<MealDayLog | null> => {
    if (log) return log
    const { data: userResult } = await supabase.auth.getUser()
    const userId = userResult?.user?.id
    if (!userId) { setError('not authenticated'); return null }
    const { data, error: createErr } = await supabase
      .from('meal_day_logs')
      .insert({ user_id: userId, log_date: dateIso, habits: {} })
      .select()
      .single()
    if (createErr || !data) { setError(createErr?.message ?? 'create failed'); return null }
    const created = dbMealDayLogToMealDayLog(data)
    setLog(created)
    return created
  }, [log, dateIso])

  const update = useCallback(async (input: UpdateInput) => {
    const existing = await ensureLog()
    if (!existing) return
    const patch: Record<string, unknown> = {}
    if (input.notes !== undefined) patch.notes = input.notes
    if (input.weightLb !== undefined) patch.weight_lb = input.weightLb
    if (input.weightNote !== undefined) patch.weight_note = input.weightNote
    if (input.habits !== undefined) patch.habits = input.habits

    const previous = existing
    setLog({
      ...existing,
      notes: input.notes !== undefined ? (input.notes ?? undefined) : existing.notes,
      weightLb: input.weightLb !== undefined ? (input.weightLb ?? undefined) : existing.weightLb,
      weightNote: input.weightNote !== undefined ? (input.weightNote ?? undefined) : existing.weightNote,
      habits: input.habits ?? existing.habits,
    })

    const { error: updErr } = await supabase
      .from('meal_day_logs')
      .update(patch)
      .eq('id', existing.id)

    if (updErr) { setLog(previous); setError(updErr.message) }
  }, [ensureLog])

  const toggleHabit = useCallback(async (key: string, value?: boolean) => {
    const existing = await ensureLog()
    if (!existing) return
    const next = value === undefined ? !existing.habits[key] : value
    const habits = { ...existing.habits, [key]: next }
    await update({ habits })
  }, [ensureLog, update])

  useEffect(() => { refresh() }, [refresh])

  return { log, loading, error, refresh, update, toggleHabit }
}

interface WeekTrendDay {
  date: Date
  totalGramsActual?: number
}

export function useWeekGramsTrend(weekStart: Date) {
  const [days, setDays] = useState<WeekTrendDay[]>([])
  const [loading, setLoading] = useState(true)

  const weekStartIso = toIsoDate(weekStart)
  const weekEndIso = (() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    return toIsoDate(d)
  })()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data: userResult } = await supabase.auth.getUser()
      const userId = userResult?.user?.id
      if (!userId) { if (!cancelled) setLoading(false); return }
      const { data } = await supabase
        .from('meal_day_logs')
        .select('log_date,total_grams_actual')
        .eq('user_id', userId)
        .gte('log_date', weekStartIso)
        .lte('log_date', weekEndIso)
      if (cancelled) return
      const byDate = new Map<string, number | undefined>()
      ;(data ?? []).forEach((r: { log_date: string; total_grams_actual: number | null }) => {
        byDate.set(r.log_date, r.total_grams_actual ?? undefined)
      })
      const out: WeekTrendDay[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        const iso = toIsoDate(d)
        out.push({ date: d, totalGramsActual: byDate.get(iso) })
      }
      setDays(out)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [weekStartIso, weekEndIso, weekStart])

  return { days, loading }
}
