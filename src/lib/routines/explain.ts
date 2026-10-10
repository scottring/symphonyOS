// src/lib/routines/explain.ts
//
// Where a routine shows, and why — in plain words, per surface (Today, the
// week, the kitchen kiosk). Built FROM resolveRoutine's rungs: this file never
// re-decides visibility, it asks the resolver (and the kiosk's own quoted rule,
// resolveRoutineOnWall) and then says what the answer means.
//
// Three strengths of "not showing", named the same way everywhere:
//   Hide for today — skips TODAY'S occurrence only (a 'skipped' instance row).
//   Rest until…    — pauses the routine everywhere; it wakes on its own.
//   Off            — keeps running (and on the kiosk), hidden from Today and
//                    planning.
//
// NOT SUPPORTED: event-relative routines ("30 minutes before soccer"). There is
// no column for an anchor event, so a routine cannot follow one; this file says
// nothing about them rather than pretending.

import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { AssigneeFilter } from '@/lib/today/types'
import { ALL_LAYERS, DOMAINS } from '@/lib/domains'
import { memberForAuthUser } from '@/lib/scope'
import { ruleSentence } from '@/lib/routineReadback'
import { readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import {
  matchesRecurrenceForDate,
  resolveRoutine,
  resolveRoutineOnWall,
  routineOwners,
  routineSwitches,
  type RoutineHideReason,
  type RoutinePrefs,
} from '@/lib/routineUtils'

/** The three ways to stop a routine showing, labelled once for every surface. */
export const ROUTINE_HIDE_LABELS = {
  today: 'Hide for today',
  rest: 'Rest until…',
  off: 'Off',
} as const

export type ExplainSurface = 'today' | 'week' | 'kiosk'

export type ExplainRung =
  | RoutineHideReason
  | 'skipped'      // Hide for today: this date's occurrence is skipped
  | 'private'      // never on the shared kiosk
  | 'not-family'   // the kiosk reads the Family layer only
  | 'no-day'       // a weekly rule with no day yet: nothing to place on the week

export interface SurfaceExplanation {
  surface: ExplainSurface
  label: 'Today' | 'Week' | 'Kiosk'
  shows: boolean
  /** One plain sentence: why it shows here, or why it doesn't. */
  reason: string
  rung: ExplainRung
}

export interface RoutineExplanation {
  today: SurfaceExplanation
  week: SurfaceExplanation
  kiosk: SurfaceExplanation
  /** The routine's own state, for the controls. */
  state: 'running' | 'resting' | 'off'
  /** Wake date for a resting routine (local calendar day), else null. */
  wakesOn: Date | null
}

export interface ExplainCtx {
  /** The day being asked about (Today's viewed date). */
  date: Date
  /** Today's lens. Defaults to every layer and no hide-daily sweep — what
   *  Today's main list itself uses (computeTodayData passes hideRoutines:false). */
  prefs?: RoutinePrefs
  /** The people filter; empty/undefined is everyone. */
  member?: AssigneeFilter
  /** This date's occurrence is skipped ("Hide for today"). */
  skippedToday?: boolean
  lastCompletedAt?: Date | null
  /** Routine ids placed onto `date` by a deferral (resolveRoutine's rung-2 override). */
  deferredInto?: ReadonlySet<string>
  /** The routine's Steps when it is a collection. */
  steps?: Routine[]
  /** The collection a Step belongs to. */
  parent?: Routine | null
  /** The household, for owner names and the kiosk's privacy rule. */
  familyMembers?: FamilyMember[]
  /** First day of the week the Week surface shows. Defaults to the household's week start. */
  weekStart?: Date
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

/** "Tue & Thu", "Mon, Wed & Fri" — the days as a person lists them. */
export function daysText(dayIdx: readonly number[]): string {
  const names = [...new Set(dayIdx)].sort((a, b) => a - b).map((i) => DAY_SHORT[i])
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

function dayIndexes(days: readonly string[] | undefined): number[] {
  return (days ?? []).map((d) => DAY_KEYS.indexOf(d.toLowerCase() as typeof DAY_KEYS[number])).filter((i) => i >= 0)
}

/** "7:00 AM" from 'HH:MM[:SS]'. */
export function clockText(t: string | null | undefined): string | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/** `paused_until` as the calendar day it names. Stored as midnight of the
 *  chosen day (kidDayModel compares the same first ten characters). */
export function wakeDate(pausedUntil: string | null | undefined): Date | null {
  if (!pausedUntil) return null
  const [y, m, d] = pausedUntil.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** "Jun 21, 2027". */
export function formatWake(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function restingReason(r: Routine): string {
  const wake = wakeDate(r.paused_until)
  return wake
    ? `Resting until ${formatWake(wake)} — it wakes on its own`
    : 'Resting — it stays asleep until you wake it'
}

function notTodayReason(r: Routine, date: Date): string {
  const p = r.recurrence_pattern
  const dayIdx = dayIndexes(p.days)
  if ((p.type === 'weekly' || p.type === 'specific_days') && dayIdx.length > 0) {
    return `Not on ${DAY_PLURAL[date.getDay()]} — runs ${daysText(dayIdx)}`
  }
  if (p.type === 'weekly') return 'No day set yet — give it one, or choose it for a day'
  return `Not due today — ${ruleSentence(p).replace(/^./, (c) => c.toLowerCase())}`
}

function domainWord(context: Routine['context']): string {
  const def = DOMAINS.find((d) => d.id === context)
  return def ? `a ${def.label} routine` : 'not tagged with an area'
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

const OFF_REASON = 'Hidden from Today and planning (Off)'
const NOT_THEIRS_REASON = "Not for the people you're viewing"

/** A not-showing rung that reads the same on Today and the week. */
function sharedReason(r: Routine, reason: RoutineHideReason, parentName?: string): string {
  switch (reason) {
    case 'resting': return restingReason(r)
    case 'off': return OFF_REASON
    case 'other-domain': return `Hidden by your area filter — it's ${domainWord(r.context)}`
    case 'not-theirs': return NOT_THEIRS_REASON
    case 'in-collection': return parentName ? `Shows inside ${parentName}` : 'Shows inside its routine'
    case 'everyday': return 'Every day — folded under Daily'
    default: return ''
  }
}

function explainToday(r: Routine, ctx: ExplainCtx, prefs: RoutinePrefs): SurfaceExplanation {
  const base = { surface: 'today' as const, label: 'Today' as const }
  const res = resolveRoutine(r, {
    date: ctx.date, member: ctx.member, prefs,
    lastCompletedAt: ctx.lastCompletedAt ?? null, deferredInto: ctx.deferredInto,
  })
  if (res.reason === 'in-collection') {
    // A Step rides its collection: it is on Today exactly when the parent is.
    if (ctx.parent) {
      const parent = explainToday(ctx.parent, { ...ctx, parent: null, steps: undefined, skippedToday: false }, prefs)
      if (!parent.shows) return { ...base, shows: false, rung: parent.rung, reason: `Inside ${ctx.parent.name}, which isn't on Today: ${parent.reason}` }
    }
    return { ...base, shows: true, rung: 'in-collection', reason: sharedReason(r, 'in-collection', ctx.parent?.name) }
  }
  if (!res.shows) {
    const reason = res.reason === 'not-today' ? notTodayReason(r, ctx.date) : sharedReason(r, res.reason)
    return { ...base, shows: false, rung: res.reason, reason }
  }
  if (ctx.skippedToday) {
    const back = matchesRecurrenceForDate(r, addDays(ctx.date, 1), ctx.lastCompletedAt ?? null)
    return { ...base, shows: false, rung: 'skipped', reason: `Skipped for today only — back ${back ? 'tomorrow' : 'next time it’s due'}` }
  }
  const doses = (r.times_per_day ?? []).map(clockText).filter((t): t is string => !!t)
  if (doses.length > 0) return { ...base, shows: true, rung: 'shows', reason: `On Today at ${doses.length > 1 ? `${doses.slice(0, -1).join(', ')} & ${doses[doses.length - 1]}` : doses[0]}` }
  const at = clockText(r.time_of_day)
  if (at) return { ...base, shows: true, rung: 'shows', reason: `On Today at ${at}` }
  if (routineSwitches(r).placedToday) return { ...base, shows: true, rung: 'shows', reason: 'Any time today' }
  // A rule that leaves the day open waits in Today's pin to be chosen (dayPlan.ts).
  return { ...base, shows: true, rung: 'shows', reason: 'Offered on Today to choose — it has no set day' }
}

function explainWeek(r: Routine, ctx: ExplainCtx, prefs: RoutinePrefs): SurfaceExplanation {
  const base = { surface: 'week' as const, label: 'Week' as const }
  // /week runs the ladder with the hide-daily sweep off (WeekViewV2), one day at a time.
  const weekPrefs: RoutinePrefs = { hideRoutines: false, layers: prefs.layers }
  const eligible = resolveRoutine(r, { date: null, member: ctx.member, prefs: weekPrefs })
  if (eligible.reason === 'in-collection') {
    if (ctx.parent) {
      const parent = explainWeek(ctx.parent, { ...ctx, parent: null, steps: undefined }, prefs)
      if (!parent.shows) return { ...base, shows: false, rung: parent.rung, reason: `Inside ${ctx.parent.name}, which isn't on the week: ${parent.reason}` }
    }
    return { ...base, shows: true, rung: 'in-collection', reason: sharedReason(r, 'in-collection', ctx.parent?.name) }
  }
  if (!eligible.shows) return { ...base, shows: false, rung: eligible.reason, reason: sharedReason(r, eligible.reason) }

  const start = ctx.weekStart ?? weekStartAnchor(ctx.date, readCadenceConfig().weekStartsOn)
  const onDays: number[] = []
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i)
    const deferredInto = day.toDateString() === ctx.date.toDateString() ? ctx.deferredInto : undefined
    if (resolveRoutine(r, { date: day, member: ctx.member, prefs: weekPrefs, deferredInto, lastCompletedAt: ctx.lastCompletedAt ?? null }).shows) {
      onDays.push(day.getDay())
    }
  }
  const p = r.recurrence_pattern
  if (onDays.length === 0) {
    if (p.type === 'weekly' && !(p.days?.length)) {
      return { ...base, shows: false, rung: 'no-day', reason: 'No day set — choose a day to put it on the week' }
    }
    return { ...base, shows: false, rung: 'not-today', reason: `Not this week — ${ruleSentence(p).replace(/^./, (c) => c.toLowerCase())}` }
  }
  const at = clockText(r.time_of_day)
  const when = onDays.length === 7 ? 'every day' : daysText(onDays)
  return { ...base, shows: true, rung: 'shows', reason: `On the week ${onDays.length === 7 ? '' : 'on '}${when}${at ? ` at ${at}` : ''}` }
}

function isAdult(m: FamilyMember): boolean {
  if (m.age_range) return m.age_range === 'adult'
  return !!m.is_full_user
}

/**
 * Private to one person: a Personal or Work routine, or an untagged one owned
 * by a single adult. Never on the shared kiosk, whatever else is true of it.
 * Assignment is not permission — owners only name whose it is.
 */
function privateOwnerName(r: Routine, members: readonly FamilyMember[]): string | false {
  const owners = routineOwners(r)
  const ownerMembers = owners.map((id) => members.find((m) => m.id === id)).filter((m): m is FamilyMember => !!m)
  const creator = memberForAuthUser(members, r.user_id)
  const nameOf = () => (ownerMembers.length === 1 ? ownerMembers[0].name : creator?.name ?? '')
  if (r.context === 'personal' || r.context === 'work') return nameOf()
  if (r.context !== 'family' && owners.length === 1 && ownerMembers.length === 1 && isAdult(ownerMembers[0])) return ownerMembers[0].name
  return false
}

function explainKiosk(r: Routine, ctx: ExplainCtx, today: SurfaceExplanation): SurfaceExplanation {
  const base = { surface: 'kiosk' as const, label: 'Kiosk' as const }
  const members = ctx.familyMembers ?? []
  const privateTo = privateOwnerName(r, members)
  if (privateTo !== false) {
    return { ...base, shows: false, rung: 'private', reason: privateTo ? `Private to ${privateTo} — never on the shared kiosk` : 'Private — never on the shared kiosk' }
  }
  // A Step is on the kiosk inside its routine; the kiosk never shows more of a
  // private collection than the collection itself.
  if (ctx.parent) {
    if (privateOwnerName(ctx.parent, members) !== false) {
      return { ...base, shows: false, rung: 'private', reason: `Inside ${ctx.parent.name}, which is private — never on the shared kiosk` }
    }
  }

  const steps = ctx.steps ?? []
  if (steps.length > 0) {
    // A collection: the kid pages read the parent's wake date and rule and
    // need at least one Step that applies; the board shows those Steps.
    const wake = wakeDate(r.paused_until)
    const dayStart = new Date(ctx.date.getFullYear(), ctx.date.getMonth(), ctx.date.getDate())
    if (wake && wake > dayStart) return { ...base, shows: false, rung: 'resting', reason: restingReason(r) }
    if (!matchesRecurrenceForDate(r, ctx.date, ctx.lastCompletedAt ?? null)) {
      return { ...base, shows: false, rung: 'not-today', reason: notTodayReason(r, ctx.date) }
    }
    const shown = steps.filter((s) => resolveRoutineOnWall(s, ctx.date).shows)
    if (shown.length === 0) {
      return { ...base, shows: false, rung: 'not-family', reason: 'None of its steps are Family steps due today' }
    }
    return { ...base, shows: true, rung: 'shows', reason: kioskShowsReason(r, today) }
  }

  const res = resolveRoutineOnWall(r, ctx.date, ctx.lastCompletedAt ?? null)
  if (!res.shows) {
    if (res.reason === 'resting') return { ...base, shows: false, rung: 'resting', reason: restingReason(r) }
    if (res.reason === 'not-today') return { ...base, shows: false, rung: 'not-today', reason: notTodayReason(r, ctx.date) }
    return { ...base, shows: false, rung: 'not-family', reason: 'Not a Family routine — the kiosk shows Family routines only' }
  }
  return { ...base, shows: true, rung: 'shows', reason: kioskShowsReason(r, today) }
}

/** The kiosk ignores Off and Hide for today — say so, so the difference is visible. */
function kioskShowsReason(r: Routine, today: SurfaceExplanation): string {
  if (today.rung === 'off') return 'Still on the kitchen kiosk — Off only clears Today and planning'
  if (today.rung === 'skipped') return 'Still on the kitchen kiosk — Hide for today only clears Today'
  const at = clockText(r.time_of_day)
  return at ? `On the kitchen kiosk at ${at}` : 'On the kitchen kiosk today'
}

/** Where this routine shows on `ctx.date`, and why, for Today, the week and the kiosk. */
export function explainRoutine(routine: Routine, ctx: ExplainCtx): RoutineExplanation {
  const prefs = ctx.prefs ?? { hideRoutines: false, layers: ALL_LAYERS }
  const today = explainToday(routine, ctx, prefs)
  const week = explainWeek(routine, ctx, prefs)
  const kiosk = explainKiosk(routine, ctx, today)
  const sw = routineSwitches(routine)
  return {
    today, week, kiosk,
    state: !sw.active ? 'resting' : sw.off ? 'off' : 'running',
    wakesOn: !sw.active ? wakeDate(routine.paused_until) : null,
  }
}

/** One line for a screen reader or a tooltip: "Today: … · Week: … · Kiosk: …". */
export function explanationSummary(e: RoutineExplanation): string {
  return [e.today, e.week, e.kiosk]
    .map((s) => `${s.label}: ${s.shows ? 'shows' : 'not showing'} — ${s.reason}`)
    .join('. ')
}
