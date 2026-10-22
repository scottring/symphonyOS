import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRefetchEvents, useRefetchOnReturn } from '@/hooks/useChoices'
import { listGoalLog } from '@/lib/choices/logDb'
import { mergeLog } from '@/lib/choices/log'
import type { GoalRef } from '@/types/choice'
import type { LogEntry, PlannedEvent } from '@/types/goalLog'

type Read = { key: string; entries: LogEntry[]; planned: PlannedEvent[] }
const NONE: LogEntry[] = []
const NO_PLANS: PlannedEvent[] = []

/** A goal's log: its entries and its planned events (tasks with log_kind),
 *  merged into Coming up, Date passed and Done. Reads again on the same signals as Choices. */
export function useGoalLog(goal: GoalRef | null) {
  const { user } = useAuth()
  const [read, setRead] = useState<Read | null>(null)
  const [loading, setLoading] = useState(true)
  const goalKind = goal?.kind
  const goalId = goal?.id
  const key = goalKind && goalId ? `${goalKind}:${goalId}` : null
  // Reads can finish out of order; only the latest one asked for counts.
  const seq = useRef(0)

  const refetch = useCallback(async () => {
    const n = ++seq.current
    if (!user || !goalKind || !goalId) { setRead(null); setLoading(false); return }
    const next = await listGoalLog(supabase, { kind: goalKind, id: goalId })
    if (n !== seq.current) return
    if (next) setRead({ key: `${goalKind}:${goalId}`, ...next }) // a failed read keeps the log already shown
    setLoading(false)
  }, [user, goalKind, goalId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / goal change
    void refetch()
  }, [refetch])
  useRefetchEvents(refetch)
  useRefetchOnReturn(refetch)

  // Another goal's log (still shown while the new one loads) is not this one's.
  const mine = read && read.key === key ? read : null
  // Today as of each read: a plan whose day has passed is set apart from Coming up.
  const log = useMemo(() => mergeLog(mine?.entries ?? NONE, mine?.planned ?? NO_PLANS, new Date()), [mine])
  return { log, entries: mine?.entries ?? NONE, loading, refetch }
}
