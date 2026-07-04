import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { SymptomLog, Severity } from '@/types/symptom'

interface DbLog {
  id: string; user_id: string; symptom_id: string; severity: Severity
  logged_at: string; note: string | null; created_at: string
}

export function dbLogToSymptomLog(r: DbLog): SymptomLog {
  return {
    id: r.id, symptomId: r.symptom_id, severity: r.severity, loggedAt: new Date(r.logged_at),
    note: r.note ?? undefined, createdAt: new Date(r.created_at),
  }
}

export function useSymptomLogs(opts: { sinceDays?: number } = {}) {
  const { user } = useAuth()
  const sinceDays = opts.sinceDays ?? 30
  const [logs, setLogs] = useState<SymptomLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setLogs([]); setLoading(false); return
    }
    let active = true
    async function fetchLogs() {
      setLoading(true); setError(null)
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
      const { data, error: e } = await supabase
        .from('symptom_logs').select('*').gte('logged_at', since).order('logged_at', { ascending: false })
      if (!active) return
      if (e) { setError(e.message); setLoading(false); return }
      setLogs((data as DbLog[]).map(dbLogToSymptomLog))
      setLoading(false)
    }
    fetchLogs()
    const channel = supabase
      .channel('symptom-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'symptom_logs', filter: `user_id=eq.${user.id}` }, fetchLogs)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [user, sinceDays])

  const logSymptom = useCallback(async (symptomId: string, severity: Severity, loggedAt?: Date, note?: string) => {
    const { error: e } = await supabase.from('symptom_logs').insert({
      symptom_id: symptomId, severity, logged_at: (loggedAt ?? new Date()).toISOString(), note: note ?? null,
    })
    if (e) setError(e.message)
  }, [])

  const updateLog = useCallback(async (id: string, patch: { symptomId?: string; severity?: Severity; loggedAt?: Date; note?: string }) => {
    const row: Record<string, unknown> = {}
    if (patch.symptomId !== undefined) row.symptom_id = patch.symptomId
    if (patch.severity !== undefined) row.severity = patch.severity
    if (patch.loggedAt !== undefined) row.logged_at = patch.loggedAt.toISOString()
    if (patch.note !== undefined) row.note = patch.note
    const { error: e } = await supabase.from('symptom_logs').update(row).eq('id', id)
    if (e) setError(e.message)
  }, [])

  const deleteLog = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('symptom_logs').delete().eq('id', id)
    if (e) setError(e.message)
  }, [])

  return { logs, loading, error, logSymptom, updateLog, deleteLog }
}
