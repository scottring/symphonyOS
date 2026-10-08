// src/lib/guide/coach.ts
//
// "Show me where things go" — the guide's optional coach (live new-user
// walkthrough 2026-10-08: the guide worked, but newcomers still had to find
// which control to use on each page). On a guided step it points to ONE real
// control on the real page, waits for the person to use it, then says what
// changed and where it was saved. It only observes: nothing here writes the
// plan.
//
// Pure: what each step points at, the words, and how a saved change is
// recognised and described. The UI is GuideCoach.tsx.
import { localYmd } from '@/lib/cadence/config'
import type { Task } from '@/types/task'
import { isReview, isSkipped, type CoachSaw, type GuideState, type GuideStep } from './guidedPlan'

/** The stable anchors on the real controls (data-guide-target="…"). */
export type CoachTarget = 'period-add' | 'paper-import' | 'week-choose' | 'today-choose' | 'today-add' | 'guide-continue'

export interface CoachPoint {
  target: CoachTarget
  /** Point at one item's control when it is on the page (data-guide-id). */
  itemId?: string
  title: string
  body: string
}

export interface CoachPlan {
  /** In order of preference: the first one found on the page is pointed at. */
  points: CoachPoint[]
  /** Said when none of them is on the page — the coach never breaks. */
  textOnly: { title: string; body: string }
  /** A second way in, said beside the first (never pointed at). */
  paper?: string
}

export interface CoachNames {
  /** The step's own period: "2026", "Fall", "October", "Week 41", "Today". */
  here: string
  /** The list beside it: the week step's month ("October"), Today's week ("Week 41"). */
  above?: string
}

/** What a step's coach asks for. Null on a look-back: its close-out card is
 *  already one decision at a time. */
export function coachPlan(step: GuideStep, state: GuideState, names: CoachNames, opts: { mobile?: boolean } = {}): CoachPlan | null {
  if (isReview(step)) return null
  const { here } = names
  const first = state.steps[0] === step
  const paper = first ? 'Have it on paper? Use Add from paper to bring it in instead.' : undefined
  if (step === 'year' || step === 'season' || step === 'month') {
    const smaller = step === 'year' ? 'seasons' : step === 'season' ? 'months' : 'weeks'
    return {
      points: [{ target: 'period-add', title: `Write one thing for ${here}.`, body: `Type it in “Add to ${here}” and press Enter. It goes on ${here}’s list and stays there as you plan the ${smaller}.` }],
      textOnly: { title: `Write one thing for ${here}.`, body: `Look for “Add to ${here}” under ${here}’s list, type one thing, and press Enter.` },
      paper,
    }
  }
  if (step === 'week') {
    const month = names.above ?? 'the month'
    return {
      points: [
        { target: 'week-choose', title: `Choose one step for ${here}.`, body: `Use “Add to this week” beside a line from ${month}. It stays on ${month}’s list too. Or type your own step below.` },
        { target: 'period-add', title: `Write one step for ${here}.`, body: `Type a next step in “Add something for this week” and press Enter. It goes on ${here}’s list.` },
      ],
      textOnly: { title: `Write one step for ${here}.`, body: `Add one next step to ${here}’s list. A call, an email or an errand is plenty.` },
      paper,
    }
  }
  // Today: the step the week left, if the coach saw one.
  const week = names.above ?? 'this week'
  const carried = state.coachDone?.week
  const from = carried && !isSkipped(carried) ? carried : null
  return {
    points: [
      // The step the week just took, when its "+ Today" is on the page…
      ...(from ? [{ target: 'today-choose' as const, itemId: from.id, title: `Choose “${from.title}” for today.`, body: `Use “+ Today” beside it in ${week}. It stays on ${week}’s list too.` }] : []),
      // …else any line from the week, else the day's own add.
      { target: 'today-choose', title: 'Choose one thing for today.', body: `Use “+ Today” beside a line from ${week}. It stays on ${week}’s list too.` },
      { target: 'today-add', title: 'Add one thing for today.', body: opts.mobile ? 'Type it in “Add to today” at the bottom and press Enter.' : 'Use “Add task” under For today, type it, and press Enter.' },
    ],
    textOnly: { title: 'Choose one thing for today.', body: `Pick something from ${week} beside the day, or add one under For today.` },
  }
}

/** After the action: point at the guide's own way on. */
export const CONTINUE_POINT: CoachPoint = { target: 'guide-continue', title: '', body: '' }

const sameYmd = (d: Date | undefined, ymd: string) => !!d && localYmd(d) === ymd

function onLevel(t: Task, level: 'season' | 'month' | 'week', start: string): boolean {
  if (t.commitments?.some((c) => c.level === level && c.status === 'open' && localYmd(c.periodStart) === start)) return true
  const cache = level === 'week' ? t.weekStart : level === 'month' ? t.monthStart : t.seasonStart
  return sameYmd(cache, start)
}

const onDay = (t: Task, ymd: string) =>
  sameYmd(t.plannedOn, ymd) || sameYmd(t.scheduledFor, ymd) || !!t.focus?.some((f) => sameYmd(f.date, ymd))

/**
 * Does this task now sit where the step puts things? Compared before and
 * after, it tells the coach that the person's own action landed — on the
 * step's period, saved (the hook only lists a write once it has succeeded).
 * The year's lines are goals, not tasks: see GuideCoach.
 */
export function landsOnStep(step: GuideStep, t: Task, state: GuideState, today: Date): boolean {
  if (t.completed || isReview(step) || step === 'year') return false
  if (step === 'today') return onDay(t, localYmd(today))
  const start = state.periods[step]
  return !!start && onLevel(t, step, start)
}

export interface AckNames {
  here: string
  /** "Week 41" — the week Today's step belongs to, when the run has one. */
  week?: string
  weekStart?: string
  /** Names a month by its first day: "October". */
  monthName: (d: Date) => string
  /** Names a day in the week: "Monday". */
  dayName: (d: Date) => string
}

/**
 * Says what changed and where it lives now: "Saved to Week 41. It’s still on
 * October’s list. It’s also on Today." The broader commitment is named, so a
 * step chosen for today is seen to keep its week and month.
 */
export function ackFor(step: GuideStep, t: Task, today: Date, names: AckNames): CoachSaw {
  const at = new Date().toISOString()
  const base = { id: t.id, title: t.title, at }
  const ymd = localYmd(today)
  const month = () => {
    const open = t.commitments?.find((c) => c.level === 'month' && c.status === 'open')
    const d = open?.periodStart ?? t.monthStart
    return d ? names.monthName(d) : null
  }
  if (step === 'year' || step === 'season' || step === 'month') {
    const smaller = step === 'year' ? 'seasons' : step === 'season' ? 'months' : 'weeks'
    return { ...base, saved: `Saved to ${names.here}.`, also: `It stays on ${names.here}’s list as you plan the ${smaller}.` }
  }
  if (step === 'week') {
    const also: string[] = []
    const m = month()
    if (m) also.push(`It’s still on ${m}’s list.`)
    if (onDay(t, ymd)) also.push('It’s also on Today.')
    else if (t.scheduledFor) also.push(`It’s on ${names.dayName(t.scheduledFor)}.`)
    return { ...base, saved: `Saved to ${names.here}.`, ...(also.length ? { also: also.join(' ') } : {}) }
  }
  // Today.
  const week = names.weekStart && onLevel(t, 'week', names.weekStart) ? names.week : null
  const m = month()
  const also = week ? `It’s still on ${week}.` : m ? `It’s still on ${m}’s list.` : undefined
  return { ...base, saved: 'Saved to Today.', ...(also ? { also } : {}) }
}

/** The year's lines are goals; a goal added for the step's year. */
export function goalAck(title: string, id: string, here: string): CoachSaw {
  return { id, title, saved: `Saved to ${here}.`, also: `It stays on ${here}’s list as you plan the seasons.`, at: new Date().toISOString() }
}
