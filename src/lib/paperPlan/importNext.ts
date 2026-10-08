// src/lib/paperPlan/importNext.ts
//
// What a paper import says once it is saved, and where planning goes next
// (friends-and-family beta, 2026-10-08: "Add 3 items" closed the review with
// a toast and nothing to do after it). Pure: the words and the destination
// are decided here; the panel (PaperImportNext) only draws them.
//
// The model is the planning cascade: a season hands on to its month, a month
// to its week, a week to today, a year to its season — the same rungs a saved
// plan hands to (nextAfterSave).

import type { PageAltitude, PlanItem } from '@/lib/planParse'
import { nextAfterSave } from '@/lib/planning/v2/planTally'
import { parseLocalYmd } from '@/lib/cadence/config'

export interface PeriodNames {
  /** "October" — the month a month-list line is for. */
  month: string
  /** "Fall" — the season a season-list line is for (no year). */
  season: string
  /** "2026". */
  year: string
}

/** One place the page's lines went, counted. */
export interface Landing { count: number; label: string }

/** The list a page of this altitude writes to by default. */
function ownKind(altitude: PageAltitude): 'week' | 'month' | 'season' | 'goal' {
  return altitude === 'year' ? 'goal' : altitude
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Where the reviewed lines go, in the page's own words: "3 on October’s
 * list", "1 on Tue, Oct 14", "1 in your Inbox". The page's own list comes
 * first. Lines matched to an item already on the plan save nothing and are
 * not counted here.
 */
export function landingsOf(items: readonly PlanItem[], notes: number, altitude: PageAltitude, names: PeriodNames, today: Date = new Date()): Landing[] {
  const counts = new Map<string, number>()
  const order: string[] = []
  const add = (label: string) => {
    if (!order.includes(label)) order.push(label)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const own = ownKind(altitude)
  const listLabel = (kind: 'week' | 'month' | 'season' | 'goal') => (
    kind === 'week' ? 'on this week’s list'
      : kind === 'month' ? `on ${names.month}’s list`
        : kind === 'season' ? `on ${names.season}’s list`
          : `on ${names.year}’s list`
  )
  // The page's own list leads, even when another place has more lines.
  if (items.some((i) => !i.sourceId && i.kind === 'task' && i.placement.kind === own)) order.push(listLabel(own))
  const dated = items.filter((i) => !i.sourceId && i.kind === 'task' && i.placement.kind === 'date')
  for (const item of items) {
    if (item.sourceId) continue
    if (item.kind === 'recurring') { add('as routines'); continue }
    if (item.kind === 'dayfact') { add('as notes'); continue }
    const p = item.placement
    switch (p.kind) {
      case 'week': case 'month': case 'season': case 'goal': add(listLabel(p.kind)); break
      case 'inbox': add('in your Inbox'); break
      case 'someday': add('kept for someday'); break
      case 'date': {
        if (p.date === ymd(today)) add('on Today')
        // One dated line names its day; several say "on their days".
        else if (dated.filter((d) => d.placement.kind === 'date' && d.placement.date !== ymd(today)).length === 1) {
          add(`on ${parseLocalYmd(p.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
        } else add('on their days')
        break
      }
    }
  }
  for (let n = 0; n < notes; n++) add('as notes')
  return order.map((label) => ({
    count: counts.get(label)!,
    // "1 as notes" reads badly; one routine/note is singular.
    label: counts.get(label) === 1 ? label.replace('as routines', 'as a routine').replace('as notes', 'as a note') : label,
  }))
}

export function landingSentence(landings: readonly Landing[]): string {
  return landings.map((l) => `${l.count} ${l.label}`).join(', ')
}

/** What the panel stores about a saved import. Serializable (sessionStorage). */
export interface SavedImport {
  id: string
  altitude: PageAltitude
  /** First day of the period the page filled (YYYY-MM-DD). */
  periodStart: string
  names: PeriodNames
  /** Rows actually written. */
  saved: number
  /** Lines that were already on the plan (nothing new written for them). */
  linked: number
  /** Rows that failed to save (the commit already said so in a toast). */
  failed: number
  landings: Landing[]
  /** Tasks the import created, so the next page can point at them. */
  taskIds: string[]
  at: number
}

const plural = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`

/** The panel's first line, and a second only when the lines went to more
 *  than the page's own list. Names the real period and the real count. */
export function savedHeadline(s: SavedImport): { headline: string; detail: string | null } {
  const ownLabel = s.altitude === 'week' ? 'on this week’s list'
    : s.altitude === 'month' ? `on ${s.names.month}’s list`
      : s.altitude === 'season' ? `on ${s.names.season}’s list`
        : `on ${s.names.year}’s list`
  const listName = s.altitude === 'week' ? 'This week’s list'
    : `Your ${s.altitude === 'month' ? s.names.month : s.altitude === 'season' ? s.names.season : s.names.year} list`
  const extras = [
    s.linked ? `${s.linked} ${s.linked === 1 ? 'was' : 'were'} already on your plan and left as ${s.linked === 1 ? 'it is' : 'they are'}.` : '',
    s.failed ? `${s.failed} couldn’t be saved.` : '',
  ].filter(Boolean).join(' ')
  if (s.saved === 0) {
    return { headline: s.linked ? `Nothing new to save — ${s.linked === 1 ? 'that item was' : `all ${s.linked} items were`} already on your plan.` : 'Nothing was saved from your page.', detail: s.failed ? `${s.failed} couldn’t be saved.` : null }
  }
  const onlyOwn = s.landings.length === 1 && s.landings[0].label === ownLabel
  if (onlyOwn) return { headline: `${listName} is saved — ${plural(s.saved)}.`, detail: extras || null }
  // Some lines went elsewhere (a day, the Inbox, another list): say where.
  const where = landingSentence(s.landings)
  return { headline: `Saved from your page — ${plural(s.saved)}.`, detail: [where ? `${where.charAt(0).toUpperCase()}${where.slice(1)}.` : '', extras].filter(Boolean).join(' ') || null }
}

export interface ImportNext {
  /** "Next, choose what you want to work on this week." */
  sentence: string
  /** Where "Continue planning" goes. */
  to: string
  /** The level whose page should open with the level above beside it
   *  (writePlanView(level, 'ref')) — the imported list stays in view. */
  openRefOn: 'season' | 'month' | 'today' | null
  /** The week page should open with this month beside it, pointing at the
   *  imported lines and "Add to this week". */
  weekFocus: boolean
}

export interface CascadeHelpers {
  weekStartOf: (d: Date) => Date
  weekNumber: (d: Date) => number
  seasonOf: (d: Date) => { start: Date; name: string }
}

/** One rung down from the period the page filled. */
export function nextAfterImport(s: Pick<SavedImport, 'altitude' | 'periodStart' | 'names'>, today: Date, h: CascadeHelpers): ImportNext {
  const start = parseLocalYmd(s.periodStart)
  if (s.altitude === 'week') {
    const isCurrent = ymd(h.weekStartOf(today)) === s.periodStart
    return isCurrent
      ? { sentence: 'Next, pick something for today.', to: '/today', openRefOn: 'today', weekFocus: false }
      : { sentence: 'It’s on its week for when it comes. Next, back to Today.', to: '/today', openRefOn: null, weekFocus: false }
  }
  const isCurrent = s.altitude === 'year' ? today.getFullYear() === start.getFullYear()
    : s.altitude === 'season' ? ymd(h.seasonOf(today).start) === s.periodStart
      : today.getFullYear() === start.getFullYear() && today.getMonth() === start.getMonth()
  const step = nextAfterSave(s.altitude, start, isCurrent, today, h)
  if (s.altitude === 'year') {
    const season = h.seasonOf(today.getFullYear() === start.getFullYear() ? today : start).name
    return { sentence: `Next, write ${season}’s list, with ${s.names.year} beside it.`, to: step.to, openRefOn: 'season', weekFocus: false }
  }
  if (s.altitude === 'season') {
    const month = parseLocalYmd(step.to.split('start=')[1] ?? s.periodStart).toLocaleDateString('en-US', { month: 'long' })
    return { sentence: `Next, write ${month}’s list, with ${s.names.season} beside it.`, to: step.to, openRefOn: 'month', weekFocus: false }
  }
  const weekStart = step.to.split('start=')[1]
  const thisWeek = weekStart === ymd(h.weekStartOf(today))
  return {
    sentence: thisWeek
      ? 'Next, choose what you want to work on this week.'
      : `Next, choose what you want to work on in week ${h.weekNumber(parseLocalYmd(weekStart))}.`,
    to: step.to, openRefOn: null, weekFocus: true,
  }
}
