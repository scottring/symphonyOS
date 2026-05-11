import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLists } from '@/hooks/useLists'

export function useOpenListCount(): number {
  const { lists } = useLists()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (lists.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on dependency change is valid
      setCount(0)
      return
    }
    let cancelled = false
    const ids = lists.map((l) => l.id)
    void supabase
      .from('list_items')
      .select('list_id')
      .in('list_id', ids)
      .eq('completed', false)
      .then(({ data }) => {
        if (cancelled || !data) return
        const distinct = new Set((data as { list_id: string }[]).map((r) => r.list_id))
        setCount(distinct.size)
      })
    return () => {
      cancelled = true
    }
  }, [lists])

  return count
}
