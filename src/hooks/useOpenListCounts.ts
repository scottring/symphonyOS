// How many open (unchecked) items each list holds, for Today's Lists line
// (2026-11-13). Through the signed-in client, so the counts cover only the
// items this person may see (RLS), the same rows the list itself shows.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useOpenListCounts(listIds: readonly string[]): { counts: ReadonlyMap<string, number>; refresh: () => void } {
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(new Map())
  const [tick, setTick] = useState(0)
  const key = [...listIds].sort().join(',')
  useEffect(() => {
    if (!key) { setCounts(new Map()); return }
    let live = true
    void (async () => {
      const { data, error } = await supabase.from('list_items').select('list_id').in('list_id', key.split(',')).eq('completed', false)
      if (!live || error || !data) return
      const next = new Map<string, number>()
      for (const row of data as { list_id: string }[]) next.set(row.list_id, (next.get(row.list_id) ?? 0) + 1)
      setCounts(next)
    })()
    return () => { live = false }
  }, [key, tick])
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  return { counts, refresh }
}
