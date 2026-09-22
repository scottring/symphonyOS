import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionableInstance } from '@/types/actionable'
import { localYmd } from '@/lib/cadence/config'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'

/** Never expose the previous day's instances while a new day is loading. */
export function useDateInstances(day: Date, read: (day: Date) => Promise<ActionableInstance[]>) {
  const key = localYmd(day)
  const [loaded, setLoaded] = useState<{ key: string; instances: ActionableInstance[] } | null>(null)
  const request = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++request.current
    const [y, m, d] = key.split('-').map(Number)
    const instances = await read(new Date(y, m - 1, d))
    if (current === request.current) setLoaded({ key, instances })
  }, [key, read])
  useEffect(() => {
    void refresh()
    const unsubscribe = onInstancesChanged(() => void refresh())
    return () => { unsubscribe(); request.current++ }
  }, [refresh])
  return { instances: loaded?.key === key ? loaded.instances : null, refresh }
}
