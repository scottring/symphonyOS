import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbStoreOverrideToOverride, type DbStoreOverride, type StoreOverride } from '@/types/meal-planner'

export function useStoreOverrides() {
  const [items, setItems] = useState<StoreOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('grocery_store_overrides')
      .select('*')
      .order('created_at', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setItems((data as DbStoreOverride[]).map(dbStoreOverrideToOverride))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const upsert = useCallback(async (pattern: string, targetListId: string) => {
    const trimmed = pattern.trim().toLowerCase()
    if (!trimmed) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: err } = await supabase
      .from('grocery_store_overrides')
      .upsert(
        { user_id: user.id, pattern: trimmed, target_list_id: targetListId },
        { onConflict: 'user_id,pattern' },
      )
    if (err) { setError(err.message); return }
    await refresh()
  }, [refresh])

  const remove = useCallback(async (pattern: string) => {
    const trimmed = pattern.trim().toLowerCase()
    const { error: err } = await supabase.from('grocery_store_overrides').delete().eq('pattern', trimmed)
    if (err) { setError(err.message); return }
    await refresh()
  }, [refresh])

  return { items, loading, error, upsert, remove, refresh }
}
