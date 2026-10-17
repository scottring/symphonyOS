// The Home checklist's one read (cadenceChecklist.ts): every planning_sessions
// row in the household for the periods it names, last and this, per horizon.
// Unknown is not "not done": a failed read shows no checklist at all.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Seasons } from '@/lib/cadence/seasons'
import type { WeekStart } from '@/lib/cadence/config'
import { checklistRows, checklistSlots, checklistTokens, type ChecklistLevel, type ChecklistRow, type SessionRow } from '@/lib/home/cadenceChecklist'

export function useCadenceChecklist(today: Date, weekStartsOn: WeekStart, seasons: Seasons, ready: boolean): { rows: Record<ChecklistLevel, ChecklistRow> | null; loading: boolean } {
  const slots = useMemo(() => checklistSlots(today, weekStartsOn, seasons), [today, weekStartsOn, seasons])
  const key = checklistTokens(slots).join('|')
  const [data, setData] = useState<{ key: string; rows: SessionRow[] | null } | null>(null)
  useEffect(() => {
    if (!ready) return
    let live = true
    void Promise.resolve(supabase.from('planning_sessions').select('horizon, period_token, notes').in('period_token', key.split('|')))
      .then(({ data: rows, error }) => { if (live) setData({ key, rows: error ? null : (rows ?? []) as SessionRow[] }) })
      .catch(() => { if (live) setData({ key, rows: null }) })
    return () => { live = false }
  }, [key, ready])
  const current = data?.key === key ? data : null
  return {
    rows: current?.rows ? checklistRows(slots, current.rows) : null,
    loading: ready && !current,
  }
}
