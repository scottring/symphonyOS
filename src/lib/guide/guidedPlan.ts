// src/lib/guide/guidedPlan.ts
//
// Guided planning: an optional path through the ordinary planning pages —
// the bigger picture (Year → Season → Month → Week → Today), the month ahead
// (Month → Week → Today), this week (Week → Today), just today — or, for
// someone already using Symphony, "pick up where you are": only the steps the
// account's own plans leave open (Scott, 2026-10-01). It is not a
// second planner: every step is the real page, with a guide bar on top, and
// what you write is the plan itself. Beta walkthrough 2026-09-29 + Codex
// build brief (onboarding suite).
//
// Pure: the dates each step plans, the words each step asks, and moving
// through the path. Persistence lives in useGuidedPlan.
import { periodBounds } from '@/lib/planning/periodPage'
import { weekStartAnchor, type WeekStart } from '@/lib/cadence/config'
import type { Seasons } from '@/lib/cadence/seasons'

export type GuideRoute = 'pickup' | 'bigger' | 'month' | 'week' | 'today'
/** A look-back ('month-review') runs on the page of the period it hands to:
 *  October's page closes out what September left open. */
export type ReviewStep = 'season-review' | 'month-review'
export type GuideStep = 'year' | 'season' | 'month' | 'week' | 'today' | ReviewStep

export const ROUTE_STEPS: Record<GuideRoute, GuideStep[]> = {
  pickup: ['year', 'season-review', 'season', 'month-review', 'month', 'week', 'today'],
  bigger: ['year', 'season', 'month', 'week', 'today'],
  month: ['month', 'week', 'today'],
  week: ['week', 'today'],
  today: ['today'],
}

export const isReview = (s: GuideStep): s is ReviewStep => s === 'season-review' || s === 'month-review'
/** The page a step runs on: a look-back runs on its level's page. */
export const pageOf = (s: GuideStep): Exclude<GuideStep, ReviewStep> => (s === 'season-review' ? 'season' : s === 'month-review' ? 'month' : s)

export const ROUTE_CHOICES: { id: GuideRoute; title: string; body: string; path: string }[] = [
  { id: 'pickup', title: 'Pick up where you are', body: 'Keep what’s already planned and fill in only what’s missing.', path: 'Only the steps that need you' },
  { id: 'bigger', title: 'The bigger picture', body: 'Connect the year ahead with what you can do next.', path: 'Year · Season · Month · Week · Today' },
  { id: 'month', title: 'The month ahead', body: 'Choose priorities for the month and steps for this week.', path: 'Month · Week · Today' },
  { id: 'week', title: 'This week', body: 'Work out what fits this week and what to do today.', path: 'Week · Today' },
  { id: 'today', title: 'Just today', body: 'Choose what needs your attention today.', path: 'Today' },
]

/** The saved progress. Versioned: an unknown shape is ignored, not trusted. */
export interface GuideState {
  v: 1
  route: GuideRoute
  /** The steps of this run, after dropping any that don't apply (a week
   *  planned ahead has no "today" step). */
  steps: GuideStep[]
  /** Each step's period, as its first day (YYYY-MM-DD). */
  periods: Partial<Record<GuideStep, string>>
  current: number
  done: GuideStep[]
  status: 'active' | 'paused' | 'finished'
  updatedAt: string
  /** "Show me where things go": on each step, point to the one control to
   *  use and say where the result was saved. Optional and off unless chosen;
   *  absent on runs saved before it existed. */
  coach?: boolean
  /** What the coach saw done on each step, so a resumed run (on any device)
   *  acknowledges it rather than asking again. Observed only — the coach
   *  never writes the plan. */
  coachDone?: Partial<Record<GuideStep, CoachSaw>>
}

/** One step's coached action: what was saved and where — or skipped. */
export type CoachSaw =
  | { id: string; title: string; saved: string; also?: string; at: string }
  | { skipped: true; at: string }

export const isSkipped = (c: CoachSaw | undefined): c is { skipped: true; at: string } => !!c && 'skipped' in c

const STEP_NAMES: GuideStep[] = ['year', 'season', 'month', 'week', 'today', 'season-review', 'month-review']

/** Only well-formed coach records survive a read; anything else is dropped,
 *  never trusted (an older or newer client may have written it). */
function parseCoachDone(raw: unknown): GuideState['coachDone'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Partial<Record<GuideStep, CoachSaw>> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!STEP_NAMES.includes(k as GuideStep) || !v || typeof v !== 'object') continue
    const c = v as Record<string, unknown>
    const at = typeof c.at === 'string' ? c.at : ''
    if (c.skipped === true) out[k as GuideStep] = { skipped: true, at }
    else if (typeof c.id === 'string' && typeof c.title === 'string' && typeof c.saved === 'string') {
      out[k as GuideStep] = { id: c.id, title: c.title, saved: c.saved, ...(typeof c.also === 'string' ? { also: c.also } : {}), at }
    }
  }
  return Object.keys(out).length ? out : undefined
}

export function parseGuideState(raw: unknown): GuideState | null {
  const s = raw as Partial<GuideState> | null
  if (!s || s.v !== 1 || !s.route || !(s.route in ROUTE_STEPS) || !Array.isArray(s.steps) || typeof s.current !== 'number') return null
  if (s.status !== 'active' && s.status !== 'paused' && s.status !== 'finished') return null
  const { coach, coachDone, ...rest } = s
  const parsedDone = parseCoachDone(coachDone)
  return {
    ...rest, periods: s.periods ?? {}, done: Array.isArray(s.done) ? s.done : [],
    ...(typeof coach === 'boolean' ? { coach } : {}),
    ...(parsedDone ? { coachDone: parsedDone } : {}),
  } as GuideState
}

/** Turn "Show me where things go" on or off for the rest of the run. */
export function withCoach(s: GuideState, on: boolean): GuideState {
  return { ...s, coach: on, updatedAt: new Date().toISOString() }
}

/** Keep what the coach saw on a step (or that it was skipped). */
export function recordCoach(s: GuideState, step: GuideStep, saw: CoachSaw): GuideState {
  return { ...s, coachDone: { ...s.coachDone, [step]: saw }, updatedAt: new Date().toISOString() }
}

const DAY = 86400000
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function parseYmd(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Close to a period's end, the next one is the one worth planning. */
const MONTH_LOOKAHEAD_DAYS = 7
const SEASON_LOOKAHEAD_DAYS = 14

export interface PeriodChoice { start: string; label: string }

/**
 * The periods a route's FIRST step can plan: the current one, and the next
 * one when the current is nearly over (Sep 29: September or October; Fall
 * starting Oct 1: Summer or Fall). The recommended one comes first.
 */
export function firstStepChoices(step: GuideStep, today: Date, seasons: Seasons, weekStartsOn: WeekStart): PeriodChoice[] {
  const t = startOfDay(today)
  if (step === 'season') {
    const cur = periodBounds('season', t, seasons)
    const next = periodBounds('season', cur.end, seasons)
    const soon = (cur.end.getTime() - t.getTime()) / DAY <= SEASON_LOOKAHEAD_DAYS
    const opt = (b: typeof cur) => ({ start: ymd(b.start), label: `${b.label.replace(/\s+\d{4}$/, '')} · ${fmtRange(b.start, new Date(b.end.getTime() - DAY))}` })
    return soon ? [opt(next), opt(cur)] : [opt(cur)]
  }
  if (step === 'month') {
    const cur = new Date(t.getFullYear(), t.getMonth(), 1)
    const next = new Date(t.getFullYear(), t.getMonth() + 1, 1)
    const soon = (next.getTime() - t.getTime()) / DAY <= MONTH_LOOKAHEAD_DAYS
    const opt = (m: Date) => ({ start: ymd(m), label: m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })
    return soon ? [opt(next), opt(cur)] : [opt(cur)]
  }
  if (step === 'year') return [{ start: `${t.getFullYear()}-01-01`, label: String(t.getFullYear()) }]
  if (step === 'week') {
    const w = weekStartAnchor(t, weekStartsOn)
    return [{ start: ymd(w), label: `This week · ${fmtRange(w, new Date(w.getTime() + 6 * DAY))}` }]
  }
  return [{ start: ymd(t), label: 'Today' }]
}

/**
 * Every step's period, each derived from the one above it: a future season
 * hands to its first month, a future month to the week holding its first day.
 * Today is always today — so it is dropped from the steps when the chosen
 * week is not this week (planning ahead ends at the week, and never puts
 * future work on today's date).
 */
export function planPeriods(route: GuideRoute, firstStart: string, today: Date, seasons: Seasons, weekStartsOn: WeekStart): { steps: GuideStep[]; periods: Partial<Record<GuideStep, string>> } {
  const t = startOfDay(today)
  const all = ROUTE_STEPS[route]
  const periods: Partial<Record<GuideStep, string>> = {}
  // `anchor` is a day inside the period just chosen — today when that period
  // is running, its first day when it is ahead. A running period hands on
  // with the same look-ahead the first step offers (Sep 29: Fall, October).
  let anchor: Date = t
  all.forEach((step, i) => {
    const running = anchor.getTime() === t.getTime()
    const pick = (fallback: Date) => (i === 0 ? parseYmd(firstStart) : fallback)
    if (step === 'year') {
      const y = pick(t).getFullYear()
      periods.year = `${y}-01-01`
      anchor = y === t.getFullYear() ? t : new Date(y, 0, 1)
    } else if (step === 'season') {
      const at = pick(running ? parseYmd(firstStepChoices('season', t, seasons, weekStartsOn)[0].start) : anchor)
      const b = periodBounds('season', at, seasons)
      periods.season = ymd(b.start)
      anchor = t >= b.start && t < b.end ? t : b.start
    } else if (step === 'month') {
      let m: Date
      if (i === 0) m = parseYmd(firstStart)
      else if (running) {
        m = parseYmd(firstStepChoices('month', t, seasons, weekStartsOn)[0].start)
        // Stay inside the season just chosen.
        const sEnd = periods.season ? periodBounds('season', parseYmd(periods.season), seasons).end : null
        if (sEnd && m >= sEnd) m = new Date(t.getFullYear(), t.getMonth(), 1)
      } else m = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      periods.month = ymd(m)
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 1)
      anchor = t >= m && t < end ? t : m
    } else if (step === 'week') {
      periods.week = ymd(weekStartAnchor(pick(anchor), weekStartsOn))
    } else {
      periods.today = ymd(t)
    }
  })
  const thisWeek = ymd(weekStartAnchor(t, weekStartsOn))
  const steps = all.filter((s) => s !== 'today' || !periods.week || periods.week === thisWeek)
  if (!steps.includes('today')) delete periods.today
  return { steps, periods }
}

export function startGuide(route: GuideRoute, firstStart: string, today: Date, seasons: Seasons, weekStartsOn: WeekStart): GuideState {
  const { steps, periods } = planPeriods(route, firstStart, today, seasons, weekStartsOn)
  return { v: 1, route, steps, periods, current: 0, done: [], status: 'active', updatedAt: new Date().toISOString() }
}

export const currentStep = (s: GuideState): GuideStep => s.steps[Math.min(s.current, s.steps.length - 1)]

export function advance(s: GuideState): GuideState {
  const step = currentStep(s)
  const done = s.done.includes(step) ? s.done : [...s.done, step]
  const last = s.current >= s.steps.length - 1
  return { ...s, done, current: last ? s.current : s.current + 1, status: last ? 'finished' : 'active', updatedAt: new Date().toISOString() }
}
export function back(s: GuideState): GuideState {
  return { ...s, current: Math.max(0, s.current - 1), status: 'active', updatedAt: new Date().toISOString() }
}
export function pause(s: GuideState): GuideState { return { ...s, status: 'paused', updatedAt: new Date().toISOString() } }
export function resume(s: GuideState): GuideState { return { ...s, status: 'active', updatedAt: new Date().toISOString() } }
export function finishHere(s: GuideState): GuideState {
  const step = currentStep(s)
  return { ...s, done: s.done.includes(step) ? s.done : [...s.done, step], status: 'finished', updatedAt: new Date().toISOString() }
}

/** Where a step's page lives, dated. */
export function stepPath(step: GuideStep, s: GuideState): string {
  const start = s.periods[step]
  if (step === 'today') return '/today'
  return start ? `/${pageOf(step)}?start=${start}` : `/${pageOf(step)}`
}

/** Does the page on screen show this step's period? */
export function onStepPage(step: GuideStep, s: GuideState, pathname: string, search: string): boolean {
  if (step === 'today') return pathname === '/today' || pathname === '/'
  if (pathname !== `/${pageOf(step)}`) return false
  const start = new URLSearchParams(search).get('start')
  return !start || start === s.periods[step]
}

/** The period a look-back closes out — the one before the step's period. */
function reviewedName(step: ReviewStep, s: GuideState, seasons: Seasons): string {
  const level = pageOf(step) as 'month' | 'season'
  const start = s.periods[step] ? parseYmd(s.periods[step]!) : new Date()
  const prev = periodBounds(level, periodBounds(level, start, seasons).prev, seasons)
  return level === 'month' ? prev.start.toLocaleDateString('en-US', { month: 'long' }) : prev.label.replace(/\s+\d{4}$/, '')
}

function fmtRange(a: Date, b: Date): string {
  const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const wd = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
  return `${wd(a)} ${md(a)} – ${wd(b)} ${md(b)}`
}

/** The step's name as the bar says it: "October", "Week 40 · Sat Sep 26 – Fri Oct 2", "Today, Tue Sep 29". */
export function stepTitle(step: GuideStep, s: GuideState, seasons: Seasons, weekNumber: (d: Date) => number): string {
  if (isReview(step)) return `Look back at ${reviewedName(step, s, seasons)}`
  const start = s.periods[step] ? parseYmd(s.periods[step]!) : new Date()
  if (step === 'year') return String(start.getFullYear())
  if (step === 'season') { const b = periodBounds('season', start, seasons); return `${b.label.replace(/\s+\d{4}$/, '')} · ${fmtRange(b.start, new Date(b.end.getTime() - DAY))}` }
  if (step === 'month') return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  if (step === 'week') return `Week ${weekNumber(start)} · ${fmtRange(start, new Date(start.getTime() + 6 * DAY))}`
  return `Today, ${start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
}

/** Short name for the path and buttons: "October", "week 40", "Fall", "2026", "today". */
export function stepShortName(step: GuideStep, s: GuideState, seasons: Seasons, weekNumber: (d: Date) => number): string {
  if (isReview(step)) return `look back at ${reviewedName(step, s, seasons)}`
  const start = s.periods[step] ? parseYmd(s.periods[step]!) : new Date()
  if (step === 'year') return String(start.getFullYear())
  if (step === 'season') return periodBounds('season', start, seasons).label.replace(/\s+\d{4}$/, '')
  if (step === 'month') return start.toLocaleDateString('en-US', { month: 'long' })
  if (step === 'week') return `week ${weekNumber(start)}`
  return 'today'
}

export const STEP_QUESTION: Record<GuideStep, string> = {
  year: 'What matters most to you this year?',
  season: 'What would meaningful progress look like this season?',
  month: 'What do you want to move forward this month?',
  week: 'What are a few next steps you can take this week?',
  today: 'What deserves your attention today?',
  'season-review': 'What happens to what’s still open?',
  'month-review': 'What happens to what’s still open?',
}

export const STEP_WHY: Record<GuideStep, string> = {
  year: 'A few outcomes or bodies of work. Keep what’s here, add what’s missing — it’s fine to leave it short.',
  season: 'Add what this season should move forward. Link a line to a year goal if it serves one; it doesn’t have to.',
  month: 'Keep what still matters and add anything missing. One or two is plenty; a quiet month is fine too.',
  week: 'Pick next steps from the month plans beside the list, or write your own. A step keeps its link to the goal it serves. Nothing needs a day yet.',
  today: 'Choose a few things from this week for today. Appointments are already here. A time is optional.',
  'season-review': 'Carry each one into the new season, mark it done, keep it for someday, or let it go. Nothing is deleted.',
  'month-review': 'Carry each one into the new month, mark it done, keep it for someday, or let it go. Nothing is deleted.',
}

/** The step above this one on the calendar — what sits beside the list. */
const ABOVE: Partial<Record<GuideStep, GuideStep>> = { season: 'year', month: 'season', week: 'month', today: 'week' }

export interface StepIdeas { prompt: string; patterns: string[] }

/**
 * Help for a blank page (walkthrough 2026-09-30: "some people won't know what
 * to enter for 'meaningful progress this season'"): one question to ask of
 * each line beside the list, and a few shapes an answer can take. Words only —
 * nothing here is written to the plan.
 */
export function stepIdeas(step: GuideStep, s: GuideState, seasons: Seasons, weekNumber: (d: Date) => number): StepIdeas | null {
  // A look-back asks about lines already written; there is nothing to write.
  if (isReview(step)) return null
  const name = (st: GuideStep) => {
    const n = stepShortName(st, s, seasons, weekNumber)
    return st === 'week' ? n.replace(/^w/, 'W') : n
  }
  const above = ABOVE[step]
  const aboveName = above && (s.periods[above] || above === 'year') ? name(above) : null
  const here = name(step)
  switch (step) {
    case 'year':
      return {
        prompt: 'Go through the parts of your life — family, health, home, work, money, friends — and ask of each: what would make this year feel well spent?',
        patterns: ['An outcome: “Get healthy”', 'A body of work: “Finish the house projects”', 'A way of living: “More time outdoors as a family”'],
      }
    case 'season':
      return {
        prompt: `Take each ${aboveName ?? 'year'} goal beside the list and ask: by the end of ${here}, what would be true? Then use “+ Add to ${here}” beside it, so the line stays linked.`,
        patterns: ['Finish something: “Finish the kids’ rooms”', 'Start something: “Swim twice a week”', 'Decide something: “Choose a couples therapist”'],
      }
    case 'month':
      return {
        prompt: `For each ${aboveName ?? 'season'} line beside the list, ask: what is ${here}’s part of it? One or two lines is plenty.`,
        patterns: ['A milestone: “Kids’ rooms painted”', 'A first step on something new: “Book a trial piano lesson”', 'A decision with a date: “Pick break dates by the 15th”'],
      }
    case 'week':
      return {
        prompt: `For each ${aboveName ?? 'month'} line beside the list, ask: what is the very next thing someone could actually do — a call, an email, an errand?`,
        patterns: ['A call or email: “Email two piano teachers”', 'An errand: “Buy porch plant hooks”', 'A conversation: “Talk with Iris about break dates”'],
      }
    default:
      return {
        prompt: 'Look at this week beside the day and ask: what has to happen today, and what would make tomorrow easier?',
        patterns: ['Something with a deadline', 'One step on something that matters', 'Something small that clears the way'],
      }
  }
}

// ── Pick up where you are ─────────────────────────────────────────────────
//
// For an account that already has plans: read what each level holds and offer
// only the steps that need attention, each with its reason. A level already
// planned is left alone and named as in place. Week and Today are always
// offered, so the path is never empty. Empty Year and Season are offered but
// start unchecked — someone partway through usually wants to get back on
// track, not rethink the year (Scott, 2026-10-01).

/** A look-back is offered while the period it hands to is still young (or
 *  not yet begun, when planning ahead). */
const REVIEW_WINDOW_DAYS = 14

/** What the account holds for the periods pickUpPeriods() names, counted from
 *  the same lists the pages show. */
export interface PickUpFacts {
  /** Active year goals this year. */
  yearGoals: number
  /** `open`: open lines on the period's plan. `planned`: someone marked it
   *  planned. `review`: lines the period before it left with no decision. */
  season: { open: number; planned: boolean; review: number }
  month: { open: number; planned: boolean; review: number }
  week: { open: number; done: number }
  todayChosen: number
}

export interface PickUpRow {
  step: GuideStep
  /** "October", "Week 40" — for a look-back, the period looked back at ("September"). */
  name: string
  /** The short reading: "6 priorities", "Nothing yet". */
  detail: string
  /** Why it's a step, said on the path: "Nothing on it yet. Fall's … beside the list." */
  why: string
  chip: 'In place' | 'Look back' | 'Plan it' | 'Optional' | 'Check it' | 'Choose'
  /** Offered as a step (else listed as in place). */
  inPath: boolean
  /** Checked to start with. */
  on: boolean
}

/** The periods a pick-up run plans: this year; the season and month the other
 *  paths would recommend (the next one near the end); this week; today. */
export function pickUpPeriods(today: Date, seasons: Seasons, weekStartsOn: WeekStart): Record<GuideStep, string> {
  const t = startOfDay(today)
  const season = firstStepChoices('season', t, seasons, weekStartsOn)[0].start
  const month = firstStepChoices('month', t, seasons, weekStartsOn)[0].start
  return {
    year: `${t.getFullYear()}-01-01`,
    'season-review': season, season,
    'month-review': month, month,
    week: ymd(weekStartAnchor(t, weekStartsOn)),
    today: ymd(t),
  }
}

/** Is there anything here to pick up? A new account sees the four plain paths. */
export function hasPlans(f: PickUpFacts): boolean {
  return f.yearGoals + f.season.open + f.month.open + f.week.open + f.week.done + f.todayChosen + f.season.review + f.month.review > 0
    || f.season.planned || f.month.planned
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function pickUpRows(f: PickUpFacts, periods: Record<GuideStep, string>, today: Date, seasons: Seasons, weekNumber: (d: Date) => number): PickUpRow[] {
  const t = startOfDay(today)
  const run: GuideState = { v: 1, route: 'pickup', steps: [], periods, current: 0, done: [], status: 'active', updatedAt: '' }
  const name = (s: GuideStep) => stepShortName(s, run, seasons, weekNumber).replace(/^./, (c) => c.toUpperCase())
  const young = (start: string) => (t.getTime() - parseYmd(start).getTime()) / DAY <= REVIEW_WINDOW_DAYS
  const rows: PickUpRow[] = []

  rows.push(f.yearGoals > 0
    ? { step: 'year', name: name('year'), detail: plural(f.yearGoals, 'goal'), why: '', chip: 'In place', inPath: false, on: false }
    : { step: 'year', name: name('year'), detail: 'Nothing yet', why: 'Optional. You can add the bigger picture later.', chip: 'Optional', inPath: true, on: false })

  const level = (lvl: 'season' | 'month', noun: string, above: string) => {
    const review: ReviewStep = lvl === 'season' ? 'season-review' : 'month-review'
    const facts = f[lvl]
    const here = name(lvl)
    if (facts.review > 0 && young(periods[lvl])) {
      const prev = reviewedName(review, run, seasons)
      const ended = parseYmd(periods[lvl]).getTime() <= t.getTime()
      rows.push({
        step: review, name: prev, detail: `${ended ? 'Ended with' : 'Has'} ${facts.review} still open`,
        why: `${facts.review} open. Carry each one into ${here}, mark it done, keep it for someday, or let it go.`,
        chip: 'Look back', inPath: true, on: true,
      })
    }
    if (facts.open > 0 || facts.planned) {
      rows.push({ step: lvl, name: here, detail: facts.open ? plural(facts.open, noun, `${noun.replace(/y$/, 'ie')}s`) : 'Marked planned', why: '', chip: 'In place', inPath: false, on: false })
    } else if (lvl === 'season') {
      rows.push({ step: lvl, name: here, detail: 'Nothing yet', why: 'Optional. Nothing on it yet; a season can stay unwritten.', chip: 'Optional', inPath: true, on: false })
    } else {
      rows.push({ step: lvl, name: here, detail: 'Nothing yet', why: `Nothing on it yet. ${above} sits beside the list.`, chip: 'Plan it', inPath: true, on: true })
    }
  }
  level('season', 'priority', `${name('year')}’s goals`)
  level('month', 'priority', `${name('season')}`)

  const weekStart = parseYmd(periods.week)
  const left = Math.round((weekStart.getTime() + 7 * DAY - t.getTime()) / DAY) - 1
  const ends = left <= 0 ? 'It ends today, so keep it short.' : left === 1 ? 'It ends tomorrow, so keep it short.' : `${left} days left.`
  const wk = f.week.open + f.week.done
  rows.push({
    step: 'week', name: name('week'),
    detail: wk ? `${plural(wk, 'step')}${f.week.done ? `, ${f.week.done} done` : ''}` : 'Nothing yet',
    why: `${wk ? `${plural(wk, 'step')} so far.` : 'No steps yet.'} ${ends}`, chip: 'Check it', inPath: true, on: true,
  })
  rows.push({
    step: 'today', name: 'Today', detail: f.todayChosen ? `${plural(f.todayChosen, 'thing')} chosen` : 'Nothing chosen',
    why: `${f.todayChosen ? `${plural(f.todayChosen, 'thing')} chosen.` : 'Nothing chosen yet.'} Your appointments are already there.`,
    chip: 'Choose', inPath: true, on: true,
  })
  return rows
}

/** A pick-up run over the chosen steps, in the order the rows list them. */
export function startPickUp(steps: GuideStep[], periods: Record<GuideStep, string>): GuideState {
  const order = ROUTE_STEPS.pickup
  const chosen = order.filter((s) => steps.includes(s))
  const picked: Partial<Record<GuideStep, string>> = {}
  for (const s of chosen) picked[s] = periods[s]
  // The rail follows the run's periods even for levels it skips.
  for (const s of ['year', 'season', 'month', 'week'] as const) picked[s] ??= periods[s]
  return { v: 1, route: 'pickup', steps: chosen, periods: picked, current: 0, done: [], status: 'active', updatedAt: new Date().toISOString() }
}
