// One-shot fetch of recent actionable_instances for the kid day page's
// progress/streak math. RLS scopes the query to the household; per-member
// filtering happens client-side in buildMemberDayModel. There is no
// realtime subscription on actionable_instances, so this refreshes on the
// same instances-changed signal the mutations emit — no polling.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'
import type { ActionableInstance } from '@/types/actionable'

const DEFAULT_DAYS = 30

function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function useMemberInstanceHistory(days: number = DEFAULT_DAYS): {
  history: ActionableInstance[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const [history, setHistory] = useState<ActionableInstance[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - days)

    const { data, error } = await supabase
      .from('actionable_instances')
      .select('*')
      .gte('date', toDateString(start))
      .lte('date', toDateString(today))

    if (error) {
      console.error('Failed to fetch instance history:', error)
      return
    }
    setHistory((data ?? []) as ActionableInstance[])
  }, [days])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void refresh().finally(() => {
      if (!cancelled) setLoading(false)
    })
    const unsubscribe = onInstancesChanged(() => void refresh())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [refresh])

  return { history, loading, refresh }
}
