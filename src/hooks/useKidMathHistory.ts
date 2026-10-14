// src/hooks/useKidMathHistory.ts
//
// One kid's Math of the day history, read-only, for the parent view on their
// page in the app (see src/lib/wall/math/mathHistory.ts). The wall's
// useKidMath makes and writes problems; this only reads them.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { localYmd } from '@/lib/cadence/config'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { addDaysYmd, dbToMathRow, HISTORY_DAYS, type DbMathRow, type MathRow } from '@/lib/wall/math/mathProgress'
import { mathSummary, type MathSummary } from '@/lib/wall/math/mathHistory'
import { parseTopics } from '@/lib/wall/math/mathTopics'

const COLUMNS = 'id, member_id, for_date, slot, kind, level, problem, wording, status, tries, solved_at'

export function useKidMathHistory(memberId: string | null, now: Date = new Date()): { summary: MathSummary | null; topics: string[]; loading: boolean } {
  const today = localYmd(now)
  const [rows, setRows] = useState<MathRow[] | null>(null)
  const [topics, setTopics] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!memberId) { setRows([]); return }
    const [{ data, error }, prefs] = await Promise.all([
      supabase.from('kid_math_problems').select(COLUMNS).eq('member_id', memberId).gte('for_date', addDaysYmd(today, -HISTORY_DAYS)),
      supabase.from('kid_math_prefs').select('topics').eq('member_id', memberId).maybeSingle(),
    ])
    if (error) { console.error('[kid-math] history failed:', error.message); setRows([]); return }
    setRows((data as DbMathRow[]).map(dbToMathRow).filter((r): r is MathRow => !!r))
    setTopics(parseTopics((prefs.data as { topics?: unknown } | null)?.topics))
  }, [memberId, today])

  useEffect(() => { void load() }, [load])
  useRefreshOnVisible(() => { void load() })

  const summary = useMemo(() => (rows && rows.length ? mathSummary(rows, today) : null), [rows, today])
  return { summary, topics, loading: rows === null }
}
