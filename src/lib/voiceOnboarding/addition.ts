// src/lib/voiceOnboarding/addition.ts
//
// "Add to my plan": one new thing, light guidance. The person says what they
// are adding and where it goes (a goal, a season or month line, a task this
// week, something for today), what it serves — a goal or a line already on
// the plan, or nothing — and, optionally, its next step one level down.
// It writes through the same rows and writers as a full session. Editing the
// pages directly stays available; this is never the only way in.

import { clean, type ExistingPlan, type Horizon, type PlanDomain } from './flow'
import type { PlanRow } from './savePlan'

export interface Addition {
  horizon: Horizon
  text: string
  /** A goal id or an existing line id it serves; null = stands alone. */
  parent: string | null
  /** Its next step one level down (optional). For a week task: do it today. */
  next: string
  nextToday: boolean
  domain: PlanDomain
  ids: { item: string; next: string }
}

export function newAddition(horizon: Horizon, parent: string | null = null, newId: () => string = () => crypto.randomUUID()): Addition {
  return { horizon, text: '', parent, next: '', nextToday: false, domain: 'personal', ids: { item: newId(), next: newId() } }
}

/** What an addition at this horizon can serve: goals, and lines on the horizons above it. */
export function parentChoices(h: Horizon, existing: ExistingPlan): { id: string; title: string; kind: 'goal' | 'season' | 'month' }[] {
  if (h === 'year') return []
  const goals = existing.goals.map((g) => ({ id: g.id, title: g.title, kind: 'goal' as const }))
  const above = (lvl: 'season' | 'month') => existing.items.filter((i) => i.horizon === lvl).map((i) => ({ id: i.id, title: i.title, kind: lvl }))
  if (h === 'season') return goals
  if (h === 'month') return [...goals, ...above('season')]
  return [...goals, ...above('month')]
}

/** The level its optional next step lands on. */
export const NEXT_LEVEL: Partial<Record<Horizon, Horizon>> = { year: 'season', season: 'month', month: 'week' }

export function additionRows(a: Addition, existing: ExistingPlan): PlanRow[] {
  const text = clean(a.text)
  if (!text) return []
  const goal = existing.goals.find((g) => g.id === a.parent)
  const item = existing.items.find((i) => i.id === a.parent)
  const goalId = goal?.id ?? item?.goalId ?? undefined
  // It lives where what it serves lives: the line's own domain, else its goal's.
  const viaGoal = existing.goals.find((g) => g.id === goalId)
  const context = item?.context ?? viaGoal?.context ?? a.domain
  const rows: PlanRow[] = []
  if (a.horizon === 'year') {
    rows.push({ id: a.ids.item, level: 'year', title: text, context })
  } else {
    // Something for today is a week task first; choosing it for today is its
    // own, checked step after it exists (savePlan: planForToday).
    const level = a.horizon === 'today' ? 'week' : a.horizon
    rows.push({
      id: a.ids.item, level, title: text, context,
      ...(goalId ? { goalId } : {}),
      ...(a.horizon === 'month' && item?.horizon === 'season' ? { sourceId: item.id } : {}),
      ...((a.horizon === 'week' || a.horizon === 'today') && item?.horizon === 'month' ? { sourceId: item.id } : {}),
    })
    if (a.horizon === 'today' || (a.horizon === 'week' && a.nextToday)) {
      rows.push({ id: `today:${a.ids.item}`, level: 'today', title: text, existingId: a.ids.item, after: a.ids.item, context })
    }
  }
  const next = clean(a.next)
  const lower = NEXT_LEVEL[a.horizon]
  if (next && lower) {
    // The next step serves the same goal; a new goal is its goal.
    const nextGoal = a.horizon === 'year' ? a.ids.item : goalId
    rows.push({
      id: a.ids.next, level: lower, title: next, context,
      ...(nextGoal ? { goalId: nextGoal } : {}),
      ...(lower === 'month' || lower === 'week' ? { sourceId: a.ids.item } : {}),
    })
  }
  return rows
}
