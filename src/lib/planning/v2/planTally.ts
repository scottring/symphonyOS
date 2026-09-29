// src/lib/planning/v2/planTally.ts
//
// Words for the planning bar (PlanStatus): what a look-back decided, and what
// the look-back step is for. Pure, so the sentences are testable.
import type { CloseDecision } from '@/components/plan/v2/FocusDeck'

/** What the look-back decided, counted as it goes. */
export type Tally = Record<CloseDecision, number>
export const EMPTY_TALLY: Tally = { carried: 0, done: 0, someday: 0, dropped: 0, left: 0 }

export function addToTally(t: Tally, d: CloseDecision): Tally {
  return { ...t, [d]: (t[d] ?? 0) + 1 }
}

/** "3 carried from Summer, 2 kept for someday, 1 let go." — or '' when nothing was decided. */
export function tallySentence(t: Tally, prevName: string): string {
  const parts = [
    t.carried ? `${t.carried} carried from ${prevName}` : '',
    t.done ? `${t.done} marked done` : '',
    t.someday ? `${t.someday} kept for someday` : '',
    t.dropped ? `${t.dropped} let go` : '',
  ].filter(Boolean)
  return parts.length ? `${parts.join(', ')}.` : ''
}

/** Step 1's sentence: what looking back decides, and that nothing is lost. */
export function lookBackWhy(prevName: string, name: string, open: number): string {
  return `${prevName} left ${open} open. For each: carry it into ${name}, mark it done, keep it for someday, or let it go. Nothing is deleted.`
}

/**
 * Where a saved plan hands on to, one level down. A season → its month (the
 * current month while the season is running, else its first month: Fall
 * saved on Sep 29 hands to October, never September). A month → its week (the
 * current week, else the week holding the month's first day). A year → the
 * current season in that year, else the year's first.
 */
export function nextAfterSave(
  level: 'year' | 'season' | 'month',
  periodStart: Date,
  isCurrent: boolean,
  today: Date,
  helpers: {
    weekStartOf: (d: Date) => Date
    weekNumber: (d: Date) => number
    seasonOf: (d: Date) => { start: Date; name: string }
  },
): { label: string; to: string } {
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (level === 'year') {
    const s = helpers.seasonOf(today.getFullYear() === periodStart.getFullYear() ? today : periodStart)
    return { label: `Choose what ${s.name} takes on`, to: `/season?start=${ymd(s.start)}` }
  }
  if (level === 'season') {
    const from = isCurrent ? today : periodStart
    const m = new Date(from.getFullYear(), from.getMonth(), 1)
    return { label: `Choose what ${m.toLocaleDateString('en-US', { month: 'long' })} takes on`, to: `/month?start=${ymd(m)}` }
  }
  const w = helpers.weekStartOf(isCurrent ? today : periodStart)
  return { label: `Choose steps for week ${helpers.weekNumber(w)}`, to: `/week?start=${ymd(w)}` }
}
