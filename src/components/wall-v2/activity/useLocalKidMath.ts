// Math of the day without the database: the same rules as useKidMath, held in
// memory. For the kiosk design previews and the stage's tests.

import { useCallback, useState } from 'react'
import type { FamilyMember } from '@/types/family'
import type { KidMath } from '@/hooks/useKidMath'
import { attempt, bonusStars, buildBonus, buildProblem, currentRow, retypedDaily, streakFor, type MathRow } from '@/lib/wall/math/mathProgress'
import type { MathKind } from '@/lib/wall/math/mathProblem'
import { parseTopics } from '@/lib/wall/math/mathTopics'

export function useLocalKidMath(kids: FamilyMember[], initial: MathRow[], today: string, initialTopics: Record<string, string[]> = {}): KidMath {
  const [rows, setRows] = useState(initial)
  const [topics, setTopicsState] = useState(initialTopics)
  const [kinds, setKinds] = useState<Record<string, MathKind | null>>({})
  const [selectedId, select] = useState<string | null>(kids[0]?.id ?? null)

  const check: KidMath['check'] = useCallback((rowId, input) => {
    const r = rows.find((x) => x.id === rowId)
    if (!r || r.status !== 'open') return null
    const res = attempt(r, input)
    setRows((prev) => prev.map((x) => (x.id === rowId ? { ...x, status: res.status, tries: res.tries } : x)))
    return res.verdict
  }, [rows])

  const addBonus: KidMath['addBonus'] = useCallback(async (memberId) => {
    const next = buildBonus(rows.filter((r) => r.memberId === memberId && r.forDate === today))
    if (!next) return false
    setRows((prev) => [...prev, { id: `${memberId}-${today}-${next.slot}`, ...next, wording: null, status: 'open', tries: 0, solvedAt: null }])
    return true
  }, [rows, today])

  const resetToday: KidMath['resetToday'] = useCallback(async (memberId) => {
    setRows((prev) => prev
      .filter((r) => !(r.memberId === memberId && r.forDate === today && r.slot > 0))
      .map((r) => (r.memberId === memberId && r.forDate === today ? { ...r, status: 'open', tries: 0, solvedAt: null } : r)))
    return true
  }, [today])

  const setTopics: KidMath['setTopics'] = useCallback((memberId, next) => {
    setTopicsState((prev) => ({ ...prev, [memberId]: parseTopics(next) }))
  }, [])

  const setKind: KidMath['setKind'] = useCallback(async (memberId, kind) => {
    setKinds((prev) => ({ ...prev, [memberId]: kind }))
    const mine = rows.filter((r) => r.memberId === memberId)
    const todays = mine.filter((r) => r.forDate === today)
    const daily = todays.find((r) => r.slot === 0)
    if (!daily) return 'today'
    const next = retypedDaily(todays, mine, kind)
    if (!next) return daily.kind === buildProblem(memberId, today, mine, kind).kind ? 'today' : 'tomorrow'
    setRows((prev) => prev.map((r) => (r.id === daily.id ? { ...r, kind: next.kind, level: next.level, spec: next.spec, wording: null } : r)))
    return 'today'
  }, [rows, today])

  return {
    kids: kids.map((member) => {
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
        kindChoice: kinds[member.id] ?? null,
      }
    }),
    selectedId: selectedId && kids.some((k) => k.id === selectedId) ? selectedId : kids[0]?.id ?? null,
    select,
    check,
    addBonus,
    resetToday,
    setTopics,
    setKind,
  }
}
