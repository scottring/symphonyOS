// The decisions made on a Day session step's rows (DayRows): which rows were
// given what, and the one write in flight.

import { useCallback, useState } from 'react'
import type { Task } from '@/types/task'

/** What a row was given: the day being planned, not that day, done, or back
 *  to the week. */
export type DayDecision = 'target' | 'not' | 'done' | 'week'

/** The decisions made on a step's rows, shared by its lists so one write at
 *  a time is in flight. */
export function useDayDecisions() {
  const [decided, setDecided] = useState<{ task: Task; d: DayDecision }[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const act = useCallback(async (t: Task, d: DayDecision | null, run: () => Promise<boolean>) => {
    setPending(t.id); setFailed(null)
    const ok = await run().catch(() => false)
    setPending(null)
    if (!ok) { setFailed(t.id); return false }
    setDecided((xs) => [...xs.filter((x) => x.task.id !== t.id), ...(d ? [{ task: t, d }] : [])])
    return true
  }, [])
  const decisionOf = (id: string) => decided.find((x) => x.task.id === id)?.d
  return { decided, decisionOf, pending, failed, act }
}
export type DayDecisions = ReturnType<typeof useDayDecisions>
