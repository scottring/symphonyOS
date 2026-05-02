import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toIsoDate } from '@/lib/weekHelpers'
import { useGeneratePlanContext } from '@/contexts/GeneratePlanContext'
import { dbWeeklyBriefToWeeklyBrief, type WeeklyBrief, type DbWeeklyBrief } from '@/types/meal-planner'

interface UseWeeklyBriefResult {
  brief: WeeklyBrief | null
  loading: boolean
  error: string | null
  setBody: (body: string) => Promise<void>
  markGenerated: () => Promise<void>
  refresh: () => Promise<void>
}

export function useWeeklyBrief(weekStart: Date): UseWeeklyBriefResult {
  const [brief, setBrief] = useState<WeeklyBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const weekStartIso = toIsoDate(weekStart)
  const { refreshSignal } = useGeneratePlanContext()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: userResult } = await supabase.auth.getUser()
    const userId = userResult?.user?.id
    if (!userId) { setError('not authenticated'); setLoading(false); return }
    // RLS scopes to the household; pick the oldest brief for the week.
    const { data: rows, error: fetchErr } = await supabase
      .from('weekly_briefs')
      .select('*')
      .eq('week_start', weekStartIso)
      .order('created_at', { ascending: true })
      .limit(1)
    const data = rows && rows[0] ? rows[0] : null
    if (fetchErr) { setError(fetchErr.message); setLoading(false); return }
    setBrief(data ? dbWeeklyBriefToWeeklyBrief(data as DbWeeklyBrief) : null)
    setLoading(false)
  }, [weekStartIso])

  const ensureBrief = useCallback(async (): Promise<WeeklyBrief | null> => {
    if (brief) return brief
    const { data: userResult } = await supabase.auth.getUser()
    const userId = userResult?.user?.id
    if (!userId) { setError('not authenticated'); return null }
    const { data, error: createErr } = await supabase
      .from('weekly_briefs')
      .insert({ user_id: userId, week_start: weekStartIso, body: '' })
      .select()
      .single()
    if (createErr || !data) { setError(createErr?.message ?? 'create failed'); return null }
    const created = dbWeeklyBriefToWeeklyBrief(data as DbWeeklyBrief)
    setBrief(created)
    return created
  }, [brief, weekStartIso])

  const setBody = useCallback(async (body: string) => {
    const existing = await ensureBrief()
    if (!existing) return
    const previous = existing.body
    setBrief({ ...existing, body })
    const { error: updErr } = await supabase
      .from('weekly_briefs')
      .update({ body })
      .eq('id', existing.id)
    if (updErr) { setBrief({ ...existing, body: previous }); setError(updErr.message) }
  }, [ensureBrief])

  const markGenerated = useCallback(async () => {
    const existing = await ensureBrief()
    if (!existing) return
    const { error: updErr } = await supabase
      .from('weekly_briefs')
      .update({ status: 'generated', generated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (updErr) { setError(updErr.message); return }
    setBrief({ ...existing, status: 'generated', generatedAt: new Date() })
  }, [ensureBrief])

  // Refetch on mount, when the week changes, and when generate bumps the signal.
  useEffect(() => { refresh() }, [refresh, refreshSignal])

  return { brief, loading, error, setBody, markGenerated, refresh }
}
