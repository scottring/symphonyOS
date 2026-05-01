import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbRestrictionToRestriction, type DbDietaryRestriction, type DietaryRestriction } from '@/types/meal-planner'

export function useDietaryRestrictions() {
  const [items, setItems] = useState<DietaryRestriction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('dietary_restrictions')
      .select('*')
      .order('created_at', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setItems((data as DbDietaryRestriction[]).map(dbRestrictionToRestriction))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const add = useCallback(async (familyMemberId: string | null, label: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const trimmed = label.trim()
    if (!trimmed) return
    const { error: err } = await supabase.from('dietary_restrictions').insert({
      user_id: user.id,
      family_member_id: familyMemberId,
      label: trimmed,
    })
    if (err) { setError(err.message); return }
    refresh()
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('dietary_restrictions').delete().eq('id', id)
    if (err) { setError(err.message); return }
    refresh()
  }, [refresh])

  return { items, loading, error, add, remove, refresh }
}
