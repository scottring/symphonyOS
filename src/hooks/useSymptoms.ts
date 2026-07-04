import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Symptom } from '@/types/symptom'

interface DbSymptom {
  id: string; user_id: string; name: string; active: boolean
  sort_order: number; created_at: string; updated_at: string
}

export function dbSymptomToSymptom(r: DbSymptom): Symptom {
  return {
    id: r.id, userId: r.user_id, name: r.name, active: r.active,
    sortOrder: r.sort_order, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  }
}

export interface SymptomInput { name: string; active?: boolean }

export function useSymptoms() {
  const { user } = useAuth()
  const [symptoms, setSymptoms] = useState<Symptom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setSymptoms([]); setLoading(false); return
    }
    let active = true
    async function fetchSymptoms() {
      setLoading(true); setError(null)
      const { data, error: e } = await supabase
        .from('symptoms').select('*').order('sort_order', { ascending: true })
      if (!active) return
      if (e) { setError(e.message); setLoading(false); return }
      setSymptoms((data as DbSymptom[]).map(dbSymptomToSymptom))
      setLoading(false)
    }
    fetchSymptoms()
    const channel = supabase
      .channel('symptoms-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'symptoms', filter: `user_id=eq.${user.id}` }, fetchSymptoms)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [user])

  const addSymptom = useCallback(async (input: SymptomInput) => {
    const { data, error: e } = await supabase.from('symptoms')
      .insert({ name: input.name, active: input.active ?? true }).select().single()
    if (e) { setError(e.message); return null }
    return dbSymptomToSymptom(data as DbSymptom)
  }, [])

  const updateSymptom = useCallback(async (id: string, patch: Partial<SymptomInput>) => {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.active !== undefined) row.active = patch.active
    row.updated_at = new Date().toISOString()
    const { error: e } = await supabase.from('symptoms').update(row).eq('id', id)
    if (e) setError(e.message)
  }, [])

  const deleteSymptom = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('symptoms').delete().eq('id', id)
    if (e) setError(e.message)
  }, [])

  return { symptoms, loading, error, addSymptom, updateSymptom, deleteSymptom }
}
