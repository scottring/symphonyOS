import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Medication } from '@/types/medication'

interface DbMedication {
  id: string; user_id: string; name: string; strength: string | null
  schedule_times: string[]; active: boolean; notes: string | null
  sort_order: number; created_at: string; updated_at: string
}

export function dbMedicationToMedication(r: DbMedication): Medication {
  return {
    id: r.id, userId: r.user_id, name: r.name,
    strength: r.strength ?? undefined,
    scheduleTimes: Array.isArray(r.schedule_times) ? r.schedule_times : [],
    active: r.active, notes: r.notes ?? undefined, sortOrder: r.sort_order,
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  }
}

export interface MedicationInput {
  name: string; strength?: string; scheduleTimes?: string[]; notes?: string; active?: boolean
}

export function useMedications() {
  const { user } = useAuth()
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setMedications([]); setLoading(false); return
    }
    let active = true
    async function fetchMeds() {
      setLoading(true); setError(null)
      const { data, error: e } = await supabase
        .from('medications').select('*').order('sort_order', { ascending: true })
      if (!active) return
      if (e) { setError(e.message); setLoading(false); return }
      setMedications((data as DbMedication[]).map(dbMedicationToMedication))
      setLoading(false)
    }
    fetchMeds()
    const channel = supabase
      .channel('medications-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medications' }, fetchMeds)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [user])

  const addMedication = useCallback(async (input: MedicationInput) => {
    const { data, error: e } = await supabase.from('medications').insert({
      name: input.name, strength: input.strength ?? null,
      schedule_times: input.scheduleTimes ?? [], notes: input.notes ?? null,
      active: input.active ?? true,
    }).select().single()
    if (e) { setError(e.message); return null }
    return dbMedicationToMedication(data as DbMedication)
  }, [])

  const updateMedication = useCallback(async (id: string, patch: Partial<MedicationInput>) => {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.strength !== undefined) row.strength = patch.strength
    if (patch.scheduleTimes !== undefined) row.schedule_times = patch.scheduleTimes
    if (patch.notes !== undefined) row.notes = patch.notes
    if (patch.active !== undefined) row.active = patch.active
    row.updated_at = new Date().toISOString()
    const { error: e } = await supabase.from('medications').update(row).eq('id', id)
    if (e) setError(e.message)
  }, [])

  const deleteMedication = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('medications').delete().eq('id', id)
    if (e) setError(e.message)
  }, [])

  return { medications, loading, error, addMedication, updateMedication, deleteMedication }
}
