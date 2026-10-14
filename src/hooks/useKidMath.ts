// src/hooks/useKidMath.ts
//
// Math of the day's data on the wall (see src/lib/wall/math). Reads the kids'
// last 90 days of rows, makes today's problem for any kid without one (built
// in code; a second wall's insert of the same day is ignored), asks Claude
// for a story once per new problem and keeps it only if it passes
// acceptWording, and owns every write a tap on Check makes. The wall shows the
// plain problem until (or unless) a story arrives.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import type { FamilyMember } from '@/types/family'
import type { MathInput } from '@/lib/wall/math/mathProblem'
import {
  addDaysYmd, attempt, buildProblem, dbToMathRow, HISTORY_DAYS, streakFor,
  type DbMathRow, type MathRow, type Verdict,
} from '@/lib/wall/math/mathProgress'
import { acceptWording, storyRequest } from '@/lib/wall/math/mathWording'

const COLUMNS = 'id, member_id, for_date, kind, level, problem, wording, status, tries, solved_at'

export interface KidMathEntry {
  member: FamilyMember
  /** Today's problem; null until it has loaded (or if it couldn't be made). */
  today: MathRow | null
  streak: number
}

export interface KidMath {
  kids: KidMathEntry[]
  selectedId: string | null
  select: (memberId: string) => void
  /** One tap on Check: the verdict at once, the write behind it. */
  check: (memberId: string, input: MathInput) => Verdict | null
}

export const firstName = (m: FamilyMember) => m.name.trim().split(/\s+/)[0] || m.name

export function useKidMath(userId: string | null, kids: FamilyMember[], today: string, onWriteFailed?: () => void): KidMath {
  const [rows, setRows] = useState<MathRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const kidIds = useMemo(() => kids.map((k) => k.id).sort().join(','), [kids])
  const asked = useRef(new Set<string>())
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const load = useCallback(async (): Promise<MathRow[] | null> => {
    if (!userId || !kidIds) { setRows([]); return [] }
    const { data, error } = await supabase
      .from('kid_math_problems')
      .select(COLUMNS)
      .in('member_id', kidIds.split(','))
      .gte('for_date', addDaysYmd(today, -HISTORY_DAYS))
      .order('for_date', { ascending: false })
    if (error) { console.error('[kid-math] load failed:', error.message); return null }
    const next = (data as DbMathRow[]).map(dbToMathRow).filter((r): r is MathRow => !!r)
    setRows(next)
    return next
  }, [userId, kidIds, today])

  // Load, then make today's problem for every kid who has none.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const loaded = await load()
      if (cancelled || !loaded || !userId) return
      const missing = kids.filter((k) => !loaded.some((r) => r.memberId === k.id && r.forDate === today))
      if (!missing.length) return
      const inserts = missing.map((k) => {
        const p = buildProblem(k.id, today, loaded.filter((r) => r.memberId === k.id))
        return { member_id: p.memberId, for_date: p.forDate, kind: p.kind, level: p.level, problem: p.spec }
      })
      const { error } = await supabase
        .from('kid_math_problems')
        .upsert(inserts, { onConflict: 'member_id,for_date', ignoreDuplicates: true })
      if (error) console.error('[kid-math] could not make today’s problems:', error.message)
      if (!cancelled) await load()
    })()
    return () => { cancelled = true }
    // kids is read through kidIds; a new array with the same kids doesn't reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, today, userId])

  useRefreshOnVisible(() => { void load() })

  // A story for each of today's problems that has none yet: asked once per
  // problem per session; kept only if it passes the checks.
  useEffect(() => {
    if (!userId) return
    for (const r of rows) {
      if (r.forDate !== today || r.wording || asked.current.has(r.id)) continue
      const kid = kids.find((k) => k.id === r.memberId)
      if (!kid) continue
      asked.current.add(r.id)
      void (async () => {
        const { data, error } = await supabase.functions.invoke('math-story', { body: storyRequest(r.spec, r.level, firstName(kid)) })
        if (error) { console.warn('[kid-math] no story:', error.message); return }
        const wording = acceptWording(data, r.spec)
        if (!wording) { console.warn('[kid-math] story didn’t pass the checks; showing the plain problem'); return }
        // Only fills an empty row: another wall's story, if it got there first, stays.
        const { error: upErr } = await supabase.from('kid_math_problems').update({ wording }).eq('id', r.id).is('wording', null)
        if (upErr) { console.error('[kid-math] story not saved:', upErr.message); return }
        setRows((prev) => prev.map((x) => (x.id === r.id && !x.wording ? { ...x, wording } : x)))
      })()
    }
  }, [rows, today, userId, kids])

  const check = useCallback((memberId: string, input: MathInput): Verdict | null => {
    const row = rowsRef.current.find((r) => r.memberId === memberId && r.forDate === today)
    if (!row || row.status !== 'open') return null
    const res = attempt(row, input)
    const solvedAt = res.status === 'solved' ? new Date().toISOString() : null
    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status: res.status, tries: res.tries, solvedAt } : x)))
    void supabase
      .from('kid_math_problems')
      .update({ status: res.status, tries: res.tries, solved_at: solvedAt })
      .eq('id', row.id)
      .then(({ error }) => {
        if (error) { console.error('[kid-math] attempt not saved:', error.message); onWriteFailed?.() }
      })
    return res.verdict
  }, [today, onWriteFailed])

  const entries = useMemo(() => kids.map((member) => {
    const mine = rows.filter((r) => r.memberId === member.id)
    return { member, today: mine.find((r) => r.forDate === today) ?? null, streak: streakFor(mine, today) }
  }), [kids, rows, today])

  const select = useCallback((memberId: string) => setSelectedId(memberId), [])
  const selected = selectedId && kids.some((k) => k.id === selectedId) ? selectedId : kids[0]?.id ?? null

  return { kids: entries, selectedId: selected, select, check }
}
