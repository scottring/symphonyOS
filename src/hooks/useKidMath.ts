// src/hooks/useKidMath.ts
//
// Math of the day's data on the wall (see src/lib/wall/math). Reads the kids'
// last 90 days of rows and their picked topics, makes today's problem for any
// kid without one (built in code; a second wall's insert of the same day is
// ignored), asks Claude for a story once per new problem — about one of the
// kid's topics when they picked some — and keeps it only if it passes
// acceptWording. Owns every write: a tap on Check, a bonus problem, a
// grown-up's reset of the day, a kid's topics. The wall shows the plain
// problem until (or unless) a story arrives.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import type { FamilyMember } from '@/types/family'
import type { MathInput } from '@/lib/wall/math/mathProblem'
import {
  addDaysYmd, attempt, bonusStars, buildBonus, buildProblem, currentRow, dbToMathRow, HISTORY_DAYS, streakFor,
  type DbMathRow, type MathRow, type NewMathProblem, type Verdict,
} from '@/lib/wall/math/mathProgress'
import { acceptWording, storyRequest } from '@/lib/wall/math/mathWording'
import { parseTopics, topicFor } from '@/lib/wall/math/mathTopics'

const COLUMNS = 'id, member_id, for_date, slot, kind, level, problem, wording, status, tries, solved_at'

export interface KidMathEntry {
  member: FamilyMember
  /** Today's daily problem (slot 0); null until it has loaded. */
  daily: MathRow | null
  /** The problem on screen: the latest of today's (a bonus once asked for). */
  current: MathRow | null
  streak: number
  /** Bonus problems solved today. */
  bonusStars: number
  /** Another bonus problem can be asked for now. */
  canBonus: boolean
  /** What they like, for the stories (topic ids). */
  topics: string[]
}

export interface KidMath {
  kids: KidMathEntry[]
  selectedId: string | null
  select: (memberId: string) => void
  /** One tap on Check: the verdict at once, the write behind it. */
  check: (rowId: string, input: MathInput) => Verdict | null
  /** Ask for the next bonus problem; false if there isn't one to give or it didn't save. */
  addBonus: (memberId: string) => Promise<boolean>
  /** A grown-up's reset: today's problem back to unsolved, bonus problems gone. */
  resetToday: (memberId: string) => Promise<boolean>
  setTopics: (memberId: string, topics: string[]) => void
}

export const firstName = (m: FamilyMember) => m.name.trim().split(/\s+/)[0] || m.name

const insertRow = (p: NewMathProblem) => ({ member_id: p.memberId, for_date: p.forDate, slot: p.slot, kind: p.kind, level: p.level, problem: p.spec })

export function useKidMath(userId: string | null, kids: FamilyMember[], today: string, onWriteFailed?: () => void): KidMath {
  const [rows, setRows] = useState<MathRow[]>([])
  const [topics, setTopicsState] = useState<Record<string, string[]>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const kidIds = useMemo(() => kids.map((k) => k.id).sort().join(','), [kids])
  const asked = useRef(new Set<string>())
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const topicsRef = useRef(topics)
  topicsRef.current = topics

  const load = useCallback(async (): Promise<MathRow[] | null> => {
    if (!userId || !kidIds) { setRows([]); return [] }
    const ids = kidIds.split(',')
    const [{ data, error }, prefs] = await Promise.all([
      supabase
        .from('kid_math_problems')
        .select(COLUMNS)
        .in('member_id', ids)
        .gte('for_date', addDaysYmd(today, -HISTORY_DAYS))
        .order('for_date', { ascending: false }),
      supabase.from('kid_math_prefs').select('member_id, topics').in('member_id', ids),
    ])
    if (!prefs.error) {
      setTopicsState(Object.fromEntries((prefs.data as { member_id: string; topics: unknown }[]).map((p) => [p.member_id, parseTopics(p.topics)])))
    }
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
      const missing = kids.filter((k) => !loaded.some((r) => r.memberId === k.id && r.forDate === today && r.slot === 0))
      if (!missing.length) return
      const inserts = missing.map((k) => insertRow(buildProblem(k.id, today, loaded.filter((r) => r.memberId === k.id))))
      const { error } = await supabase
        .from('kid_math_problems')
        .upsert(inserts, { onConflict: 'member_id,for_date,slot', ignoreDuplicates: true })
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
      const topic = topicFor(topicsRef.current[r.memberId] ?? [], r.memberId, r.forDate, r.slot)
      void (async () => {
        const { data, error } = await supabase.functions.invoke('math-story', { body: storyRequest(r.spec, r.level, firstName(kid), topic?.about ?? null) })
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

  const check = useCallback((rowId: string, input: MathInput): Verdict | null => {
    const row = rowsRef.current.find((r) => r.id === rowId)
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
  }, [onWriteFailed])

  const addBonus = useCallback(async (memberId: string) => {
    const next = buildBonus(rowsRef.current.filter((r) => r.memberId === memberId && r.forDate === today))
    if (!next) return false
    const { error } = await supabase
      .from('kid_math_problems')
      .upsert([insertRow(next)], { onConflict: 'member_id,for_date,slot', ignoreDuplicates: true })
    if (error) { console.error('[kid-math] bonus not saved:', error.message); onWriteFailed?.(); return false }
    await load()
    return true
  }, [today, load, onWriteFailed])

  const resetToday = useCallback(async (memberId: string) => {
    const mine = rowsRef.current.filter((r) => r.memberId === memberId && r.forDate === today)
    const daily = mine.find((r) => r.slot === 0)
    if (!daily) return false
    const bonusIds = mine.filter((r) => r.slot > 0).map((r) => r.id)
    const [up, del] = await Promise.all([
      supabase.from('kid_math_problems').update({ status: 'open', tries: 0, solved_at: null }).eq('id', daily.id),
      bonusIds.length ? supabase.from('kid_math_problems').delete().in('id', bonusIds) : Promise.resolve({ error: null }),
    ])
    const err = up.error ?? del.error
    if (err) { console.error('[kid-math] reset failed:', err.message); onWriteFailed?.() }
    await load()
    return !err
  }, [today, load, onWriteFailed])

  const setTopics = useCallback((memberId: string, next: string[]) => {
    const clean = parseTopics(next)
    setTopicsState((prev) => ({ ...prev, [memberId]: clean }))
    void supabase
      .from('kid_math_prefs')
      .upsert({ member_id: memberId, topics: clean }, { onConflict: 'member_id' })
      .then(({ error }) => {
        if (error) { console.error('[kid-math] topics not saved:', error.message); onWriteFailed?.() }
      })
  }, [onWriteFailed])

  const entries = useMemo(() => kids.map((member): KidMathEntry => {
    const mine = rows.filter((r) => r.memberId === member.id)
    const todays = mine.filter((r) => r.forDate === today)
    return {
      member,
      daily: todays.find((r) => r.slot === 0) ?? null,
      current: currentRow(todays),
      streak: streakFor(mine, today),
      bonusStars: bonusStars(todays),
      canBonus: !!buildBonus(todays),
      topics: topics[member.id] ?? [],
    }
  }), [kids, rows, today, topics])

  const select = useCallback((memberId: string) => setSelectedId(memberId), [])
  const selected = selectedId && kids.some((k) => k.id === selectedId) ? selectedId : kids[0]?.id ?? null

  return { kids: entries, selectedId: selected, select, check, addBonus, resetToday, setTopics }
}
