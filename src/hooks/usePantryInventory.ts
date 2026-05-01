import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbPantryToPantry, type DbPantryInventory, type PantryInventory, type PantryLevel } from '@/types/meal-planner'

export function usePantryInventory() {
  const [items, setItems] = useState<PantryInventory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase.from('pantry_inventory').select('*')
    if (err) { setError(err.message); setLoading(false); return }
    setItems((data as DbPantryInventory[]).map(dbPantryToPantry))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const setLevel = useCallback(async (pattern: string, level: PantryLevel) => {
    const trimmed = pattern.trim().toLowerCase()
    if (!trimmed) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase
      .from('pantry_inventory')
      .upsert(
        { user_id: user.id, pattern: trimmed, level, last_checked_at: new Date().toISOString() },
        { onConflict: 'user_id,pattern' },
      )
    if (err) { setError(err.message); return }
    await refresh()
  }, [refresh])

  const clear = useCallback(async (pattern: string) => {
    const trimmed = pattern.trim().toLowerCase()
    const { error: err } = await supabase.from('pantry_inventory').delete().eq('pattern', trimmed)
    if (err) { setError(err.message); return }
    await refresh()
  }, [refresh])

  return { items, loading, error, setLevel, clear, refresh }
}
