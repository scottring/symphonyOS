// Departure and bedtime as kiosk activities, and the rule that keeps a
// person's page open while they're in the middle of something
// (conversational canvas, slice 7).
//
// Built only from what the wall already shows: each kid's morning hint,
// things to bring and homework due (MomentKid), today's privacy-filtered
// rows, and each kid's routine checklist (checklistFor). Departure ticks are
// "packed" marks kept on this wall for today — they do NOT complete the
// underlying tasks, which stay for the person who owns them. Bedtime ticks go
// through the wall's existing tick handler and write the routine instance.
//
// PURE.

import type { KidRow } from '../kidDayModel'
import type { WallChecklist, WallTodayRow } from '../wallMomentsModel'
import { normalizeGroceryText as normalize } from './groceryProposal'
import { parseWallClock } from './kioskCompose'

// ─── Departure ─────────────────────────────────────────────────────

export interface DepartureKid {
  member: { id: string; name: string }
  hint: string | null
  needed: string[]
  homeworkDue: string[]
}

export interface DepartureItem { key: string; text: string; kind: 'do' | 'bring' | 'homework'; done: boolean }
export interface DeparturePerson { memberId: string; name: string; items: DepartureItem[] }

export interface DepartureModel {
  /** "school run", or the event's title. */
  label: string
  /** When the departure's event starts (no travel times are stored, so the
   *  countdown is to the start, and says so). Null when nothing is found. */
  at: Date | null
  atLabel: string | null
  people: DeparturePerson[]
  done: number
  total: number
}

/** The next thing the household leaves for: today's first upcoming row that
 *  is school, else the first upcoming row with a place. */
export function nextDeparture(rows: WallTodayRow[], now: Date): { title: string; at: Date; time: string } | null {
  const ahead = rows
    .filter((r) => !r.past)
    .map((r) => ({ r, at: r.startsAt != null ? new Date(r.startsAt) : parseWallClock(r.time, now) }))
    .filter((x): x is { r: WallTodayRow; at: Date } => !!x.at && x.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  const pick = ahead.find((x) => /\bschool\b/i.test(x.r.title)) ?? ahead.find((x) => x.r.kind === 'event' && !!x.r.sub)
  return pick ? { title: pick.r.title, at: pick.at, time: pick.r.time } : null
}

export function buildDeparture(kids: DepartureKid[], rows: WallTodayRow[], now: Date, checked: string[]): DepartureModel {
  const ticked = new Set(checked)
  const people: DeparturePerson[] = kids.map((k) => {
    const items: DepartureItem[] = []
    const add = (kind: DepartureItem['kind'], text: string) => {
      const key = `${k.member.id}:${kind}:${normalize(text)}`
      if (items.some((i) => i.key === key)) return
      items.push({ key, text, kind, done: ticked.has(key) })
    }
    if (k.hint) add('do', k.hint)
    k.needed.forEach((n) => add('bring', n))
    k.homeworkDue.forEach((h) => add('homework', h))
    return { memberId: k.member.id, name: k.member.name, items }
  })
  const next = nextDeparture(rows, now)
  const all = people.flatMap((p) => p.items)
  return {
    label: next ? (/\bschool\b/i.test(next.title) ? 'school run' : next.title) : 'out the door',
    at: next?.at ?? null,
    atLabel: next ? `${next.title} at ${next.time}` : null,
    people,
    done: all.filter((i) => i.done).length,
    total: all.length,
  }
}

/** "in 22 min", "in 1 hr 5 min", "now". */
export function countdownLabel(at: Date, now: Date): string {
  const min = Math.ceil((at.getTime() - now.getTime()) / 60_000)
  if (min <= 0) return 'now'
  if (min < 60) return `in ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `in ${h} hr ${m} min` : `in ${h} hr`
}

// ─── Bedtime ───────────────────────────────────────────────────────

export interface BedtimeCell { memberId: string; row: KidRow | null }
export interface BedtimeStep { key: string; title: string; cells: BedtimeCell[] }
export interface BedtimeGrid {
  title: string
  people: { id: string; name: string }[]
  steps: BedtimeStep[]
  done: number
  total: number
  inProgress: boolean
}

/** Steps × people: one row per step (matched across kids by its words), one
 *  column per person with a list tonight. A cell is empty when that person's
 *  routine doesn't have the step. */
export function buildBedtimeGrid(lists: { member: { id: string; name: string }; list: WallChecklist | null }[]): BedtimeGrid {
  const withList = lists.filter((l) => l.list && l.list.rows.length > 0)
  const people = withList.map((l) => ({ id: l.member.id, name: l.member.name }))
  const steps: BedtimeStep[] = []
  for (const { member, list } of withList) {
    for (const row of list!.rows) {
      const key = normalize(row.title)
      let step = steps.find((s) => s.key === key)
      if (!step) {
        step = { key, title: row.title, cells: people.map((p) => ({ memberId: p.id, row: null })) }
        steps.push(step)
      }
      const cell = step.cells.find((c) => c.memberId === member.id)
      if (cell && !cell.row) cell.row = row
    }
  }
  const rows = steps.flatMap((s) => s.cells.map((c) => c.row).filter((r): r is KidRow => !!r))
  const done = rows.filter((r) => r.done).length
  return {
    title: withList[0]?.list?.title ?? 'Bedtime',
    people,
    steps,
    done,
    total: rows.length,
    inProgress: done > 0 && done < rows.length,
  }
}

// ─── A person's page and inactivity ────────────────────────────────

/**
 * May a person's day page close itself after the idle timeout? Not while a
 * reading timer is running, and not while the checklist for this part of the
 * day is under way (some ticked, some not) — a kid halfway through "Out the
 * door" who stops to find a shoe must come back to the same page. A finished
 * or untouched checklist doesn't hold the page.
 */
export function kidViewHoldsOpen({ checklistRows, readingTimerRunning }: { checklistRows: Pick<KidRow, 'done'>[]; readingTimerRunning: boolean }): boolean {
  if (readingTimerRunning) return true
  const done = checklistRows.filter((r) => r.done).length
  return done > 0 && done < checklistRows.length
}
