import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { MedicationLog, MedSource } from '@/types/medication'

interface DbLog {
  id: string; user_id: string; medication_id: string; taken_at: string
  source: MedSource; note: string | null; created_at: string
}

export function dbLogToLog(r: DbLog): MedicationLog {
  return {
    id: r.id, medicationId: r.medication_id, takenAt: new Date(r.taken_at),
    source: r.source, note: r.note ?? undefined, createdAt: new Date(r.created_at),
  }
}

export function useMedicationLogs(opts: { sinceDays?: number } = {}) {
  const { user } = useAuth()
  const sinceDays = opts.sinceDays ?? 30
  const [logs, setLogs] = useState<MedicationLog[]>([])
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
        .from('medication_logs').select('*').gte('taken_at', since).order('taken_at', { ascending: false })
      if (!active) return
      if (e) { setError(e.message); setLoading(false); return }
      setLogs((data as DbLog[]).map(dbLogToLog))
      setLoading(false)
    }
    fetchLogs()
    const channel = supabase
      .channel('medication-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medication_logs', filter: `user_id=eq.${user.id}` }, fetchLogs)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [user, sinceDays])

  const logDose = useCallback(async (medicationId: string, takenAt?: Date, note?: string) => {
    const { error: e } = await supabase.from('medication_logs').insert({
      medication_id: medicationId, taken_at: (takenAt ?? new Date()).toISOString(),
      source: 'web', note: note ?? null,
    })
    if (e) setError(e.message)
  }, [])

  const updateLog = useCallback(async (id: string, patch: { takenAt?: Date; note?: string }) => {
    const row: Record<string, unknown> = {}
    if (patch.takenAt !== undefined) row.taken_at = patch.takenAt.toISOString()
    if (patch.note !== undefined) row.note = patch.note
    const { error: e } = await supabase.from('medication_logs').update(row).eq('id', id)
    if (e) setError(e.message)
  }, [])

  const deleteLog = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('medication_logs').delete().eq('id', id)
    if (e) setError(e.message)
  }, [])

  return { logs, loading, error, logDose, updateLog, deleteLog }
}
