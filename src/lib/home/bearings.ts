// src/lib/home/bearings.ts
//
// Home (/overview) is the page you come back to for your bearings (Scott,
// 2026-10-11): what is happening today, what is waiting on you, where you are
// in the plan, and ONE suggested next step. Everything here is plain words
// read from facts the page has already filtered by area and people. Small
// numbers in sentences are written out; the glance tiles (2026-10-18) show
// the same facts as figures.

import { ALL_LAYERS, LAYER_LABELS, type Layer } from '@/lib/domains'
import { deckWeekUrl } from '@/lib/planning/deck'

export interface LevelFacts {
  /** "Fall", "October". */
  name: string
  /** Open lines on this period's list. */
  open: number
  /** Someone marked it planned. */
  planned: boolean
  /** Lines the period before it left undecided, while a look-back is offered. */
  review: number
  /** The period looked back at ("September"). */
  reviewName: string
  /** Its first day (YYYY-MM-DD): the look-back opens its review by hand. */
  reviewStart?: string
}

/** Where "Look back" goes: the period's review by hand (PeriodReview). */
export function lookBackPath(level: 'month' | 'season', f: Pick<LevelFacts, 'reviewStart'>): string {
  return f.reviewStart ? `/${level}?start=${f.reviewStart}&review=1` : `/${level}`
}

export interface BearingsFacts {
  now: Date
  /** Days of the household week still ahead, today included (7 on its first day). */
  weekDaysLeft: number
  /** First day (YYYY-MM-DD) of the household week: "Plan the week" opens the review deck on it. */
  weekStart?: string
  week: { planned: boolean; open: number; done: number }
  month: LevelFacts
  season: LevelFacts
  inbox: number
  /** Unchosen is not empty: things chosen for today, still open. */
  todayChosen: number
  /** Timed events today that have not ended yet. */
  eventsAhead: number
}

export type NextStepId = 'plan-week' | 'look-back-month' | 'look-back-season' | 'plan-month' | 'sort-inbox' | 'choose-today' | 'do-today'

export interface NextStep {
  id: NextStepId
  title: string
  body: string
  action: { label: string; to: string }
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** "three", "12" — written out while small, as the paper would. */
export function numberWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

/** "three lines", "one line", "no lines". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${numberWord(n)} ${n === 1 ? one : many}`
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "Good morning" before noon, "Good afternoon" until six, then evening. */
export function greeting(now: Date): string {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/**
 * Every step the facts support, most useful first. The page shows the first
 * one not set aside today; "Go do today" is always last, so there is always
 * something to say.
 */
export function nextSteps(f: BearingsFacts): NextStep[] {
  const out: NextStep[] = []
  const evening = f.now.getHours() >= 20

  if (!f.week.planned && f.weekDaysLeft >= 3) {
    const waiting = f.week.open ? ` ${capital(count(f.week.open, 'thing'))} ${f.week.open === 1 ? 'is' : 'are'} waiting for a day.` : ''
    out.push({
      id: 'plan-week',
      title: f.weekDaysLeft >= 6 ? 'The week ahead hasn’t been planned yet.' : 'This week hasn’t been planned yet.',
      body: `${f.weekDaysLeft >= 6 ? '' : `${capital(numberWord(f.weekDaysLeft))} days left.`}${waiting} ${f.month.name}’s list sits beside you while you choose.`.trim(),
      action: { label: 'Plan the week', to: f.weekStart ? deckWeekUrl(f.weekStart) : '/week' },
    })
  }
  if (f.month.review > 0) {
    out.push({
      id: 'look-back-month',
      title: `${f.month.reviewName} closed with ${count(f.month.review, 'open line')}.`,
      body: `Carry each into ${f.month.name}, call it done, or let it go.`,
      action: { label: 'Look back', to: lookBackPath('month', f.month) },
    })
  }
  if (f.season.review > 0) {
    out.push({
      id: 'look-back-season',
      title: `${f.season.reviewName} closed with ${count(f.season.review, 'open line')}.`,
      body: `Carry each into ${f.season.name}, call it done, or let it go.`,
      action: { label: 'Look back', to: lookBackPath('season', f.season) },
    })
  }
  if (!f.month.planned && f.month.open === 0) {
    out.push({
      id: 'plan-month',
      title: `${f.month.name} has nothing on it yet.`,
      body: `${f.season.name}’s list sits beside it. Nothing written there has to be done.`,
      action: { label: `Write ${f.month.name}’s list`, to: '/month' },
    })
  }
  if (f.inbox >= 5) {
    out.push({
      id: 'sort-inbox',
      title: `${capital(count(f.inbox, 'capture'))} ${f.inbox === 1 ? 'is' : 'are'} waiting in the Inbox.`,
      body: 'Give each one a home, or let it go.',
      action: { label: 'Sort the Inbox', to: '/inbox' },
    })
  }
  if (f.todayChosen === 0 && !evening) {
    out.push({
      id: 'choose-today',
      title: 'Nothing is chosen for today yet.',
      body: `Pick what today is for${f.week.open ? ' from the week’s list' : ''}. Your appointments are already there.`,
      action: { label: 'Choose for today', to: '/today' },
    })
  }
  out.push({
    id: 'do-today',
    title: evening ? 'The day is nearly done.' : 'You’re set for today.',
    body: evening ? 'See what’s left, or look at tomorrow.' : 'Everything is in its place. Go do the work.',
    action: { label: 'Open Today', to: '/today' },
  })
  return out
}

/** The first step not set aside today. */
export function chooseNextStep(f: BearingsFacts, setAside: ReadonlySet<NextStepId>): NextStep {
  const steps = nextSteps(f)
  return steps.find((s) => !setAside.has(s.id)) ?? steps[steps.length - 1]
}

export interface TimedItem { title: string; start: Date; end: Date }

/** "10:30", "2:00" — Today's own clock, no AM/PM. */
export const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?(AM|PM)$/i, '')

/** "in 20 minutes", "in an hour and a half", "in 3 hours". */
export function inTime(from: Date, to: Date): string {
  const mins = Math.round((to.getTime() - from.getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 50) return `in ${mins} minute${mins === 1 ? '' : 's'}`
  if (mins < 75) return 'in an hour'
  if (mins < 105) return 'in an hour and a half'
  return `in ${Math.round(mins / 60)} hours`
}

/**
 * One sentence for the day's shape: what is on now or next, and how far off.
 * Null when nothing timed is left, so the page says something kinder itself.
 */
export function nextUp(events: readonly TimedItem[], now: Date): { lead: string; what: string; rest: string } | null {
  const ahead = events.filter((e) => e.end > now).sort((a, b) => a.start.getTime() - b.start.getTime())
  const first = ahead[0]
  if (!first) return null
  const on = first.start <= now
  const then = ahead[1]
  const rest = then ? ` Then ${then.title} at ${clock(then.start)}.` : ''
  return on
    ? { lead: 'On now:', what: `${first.title}, until ${clock(first.end)}`, rest: `.${rest}` }
    : { lead: 'Next up is', what: `${first.title} at ${clock(first.start)}`, rest: `, ${inTime(now, first.start)}.${rest}` }
}

/** "10:30–12:00" for a row's time column; one time for a moment (a routine). */
export function timeRange(start: Date, end: Date): string {
  return end.getTime() > start.getTime() ? `${clock(start)}–${clock(end)}` : clock(start)
}

/** "Showing Work only" / "Showing Work and Family" — null when every area is on. */
export function lensLine(layers: ReadonlySet<Layer>, people: string[]): string | null {
  const areas = [...ALL_LAYERS].every((l) => layers.has(l)) ? null : [...layers].map((l) => LAYER_LABELS[l])
  const parts: string[] = []
  if (areas) parts.push(areas.length === 1 ? `${areas[0]} only` : `${areas.slice(0, -1).join(', ')} and ${areas[areas.length - 1]}`)
  if (people.length) parts.push(people.length === 1 ? `for ${people[0]}` : `for ${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}`)
  return parts.length ? `Showing ${parts.join(', ')}` : null
}
