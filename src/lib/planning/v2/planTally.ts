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

/** What a save leaves to say about the look-back, in words, not counts
 *  ("October's open work is decided."), or '' when there was none. */
export function decidedSentence(t: Tally, prevName: string): string {
  const decided = t.carried + t.done + t.someday + t.dropped
  return decided ? `${prevName}’s open work is decided.` : ''
}

/** Step 1's sentence: what looking back decides, and that nothing is lost —
 *  then, once every card is decided, that it is (the bar kept asking after
 *  the last decision, walkthrough 2026-10-02 #30). No counts: a plan is not
 *  a scoreboard. */
export function lookBackWhy(prevName: string, name: string, remaining: number): string {
  return remaining > 0
    ? `${prevName} left work open. For each: carry it into ${name}, mark it done, keep it for someday, or let it go. Nothing is deleted.`
    : `${prevName}’s open work is decided. Next, write ${name}.`
}

/**
 * What the "Plan <period>" step asks, in a sentence. A list that already has
 * lines is checked against the level above, not written from scratch: "write
 * what Fall is for" over a 14-line list didn't say what to do (Scott,
 * 2026-10-02).
 */
export function planWhy(level: 'season' | 'month', name: string, aboveName: string, lines: number): string {
  if (level === 'month') {
    return lines
      ? `Check ${name}’s list against ${aboveName} and the calendar: keep what still matters, cut what doesn’t, add what’s missing. A quiet month is fine.`
      : `Look at ${aboveName} and the calendar, then write what ${name} is for. A quiet month is fine.`
  }
  // A season is a brainstorm list (Scott, 2026-10-04): everything we want in
  // it, with the year to look at if it helps.
  return lines
    ? `Read ${name}’s list again: keep what still matters, cut what doesn’t, add what’s missing.`
    : `Write everything you’d like ${name} to hold. No types, no dates — ${aboveName} is there to look at if it helps.`
}

/**
 * Where a saved plan hands on to, one level down. A season → its month (the
 * current month while the season is running, else its first month: Fall
 * saved on Sep 29 hands to October, never September). A month → its week (the
 * current week, else the week holding the month's first day) — but on a
 * week's last day, the next one: a week ending today has nothing left to
 * plan (walkthrough 2026-10-02 #18). A year → the current season in that
 * year, else the year's first. Each rung says what you do there: "Write
 * October's list", "Plan week 41" (2026-10-04; was "Choose what X takes on", #32).
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
    return { label: `Write ${s.name}’s list`, to: `/season?start=${ymd(s.start)}` }
  }
  if (level === 'season') {
    const from = isCurrent ? today : periodStart
    const m = new Date(from.getFullYear(), from.getMonth(), 1)
    return { label: `Write ${m.toLocaleDateString('en-US', { month: 'long' })}’s list`, to: `/month?start=${ymd(m)}` }
  }
  const w0 = helpers.weekStartOf(isCurrent ? today : periodStart)
  const lastDay = new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() + 6)
  const endsToday = isCurrent && ymd(lastDay) === ymd(today)
  const w = endsToday ? new Date(w0.getFullYear(), w0.getMonth(), w0.getDate() + 7) : w0
  return { label: `Plan week ${helpers.weekNumber(w)}`, to: `/week?start=${ymd(w)}` }
}

/**
 * The step after a horizon's list, offered beneath the whole list at rest —
 * not only after "Mark planned" (walkthrough 2026-10-08: after writing a Fall
 * milestone there was nothing in the page saying what came next). The same
 * destination as after a save (nextAfterSave), named for a button and
 * explained in a line. Never automatic: the list stays open for more.
 */
export function onwardStep(
  level: 'season' | 'month',
  periodStart: Date,
  periodName: string,
  isCurrent: boolean,
  today: Date,
  helpers: Parameters<typeof nextAfterSave>[4],
): { label: string; to: string; why: string } {
  const next = nextAfterSave(level, periodStart, isCurrent, today, helpers)
  const at = new Date(`${next.to.split('start=')[1]}T00:00:00`)
  if (level === 'season') {
    const month = at.toLocaleDateString('en-US', { month: 'long' })
    return { label: `Continue to ${month}`, to: next.to, why: `Choose what you want to move forward in ${month}. ${periodName}’s list stays beside it.` }
  }
  const end = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 6)
  const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return {
    label: `Plan week ${helpers.weekNumber(at)} · ${md(at)} – ${md(end)}`,
    to: next.to,
    why: `Choose a few doable actions for that week from ${periodName}’s priorities. Not every priority needs something every week; ${periodName} stays beside the week.`,
  }
}
