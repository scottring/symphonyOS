// src/lib/voiceOnboarding/flow.ts
//
// The conversation behind "Plan out loud" (prototype). Optional guidance
// beside the ordinary planning pages — never a second plan. What the person
// already has (their year goals, the season, month and week lists) comes in
// as an ExistingPlan and is shown, kept and reused; only what is new is
// written, and only on Save.
//
// Three intents, kept apart from the horizon (Scott, 2026-10-08):
//  - Build my plan: a session that starts at one of five horizons and moves
//    BREADTH-FIRST — every goal at the year, then every goal's season, then
//    the month across all goals, one collective week, then today. It never
//    walks one goal down to today and loops back for the next. Each horizon
//    ends at a checkpoint that shows it whole before the next one starts.
//  - Add to my plan: one new thing, what it serves, and an optional next step.
//  - Review my plan: hands off to the existing look-back workflows.
//
// Rules the reducer keeps:
//  - Lists above the week are for looking; the week and the day are for
//    doing. A goal needs nothing in any particular period ("Not this season").
//  - An answer that is already doable can go straight onto this week — but it
//    only settles THAT goal. The session stays on the horizon until the person
//    continues, so the other goals are still asked.
//  - Nothing here touches a microphone or the database.

export const HORIZONS = ['year', 'season', 'month', 'week', 'today'] as const
export type Horizon = (typeof HORIZONS)[number]
export const LEVEL_NAME: Record<Horizon, string> = { year: 'Year', season: 'Season', month: 'Month', week: 'Week', today: 'Today' }
export type ListHorizon = 'season' | 'month'
/** Each horizon is asked, then shown whole at its checkpoint. Today goes
 *  straight to the review, which is the last checkpoint. */
export type CheckStep = 'year:check' | 'season:check' | 'month:check' | 'week:check'
export type Step = Horizon | CheckStep | 'review'
export type PlanDomain = 'personal' | 'family' | 'work'

/** A line with no year goal behind it ("Something else"). */
export const FREE = 'free'

// Guidance is said, not enforced: past a SUGGESTED number the page says so
// gently and still takes the answer. The MAX numbers are only a sanity bound
// on one session, and reaching one is always said on screen (see `limitNote`).
export const SUGGESTED_GOALS = 5
export const MAX_GOALS = 12
/** A full week, said gently. */
export const WEEK_FULL = 7
export const MAX_WEEK_NEW = 25
/** A good day: two or three things, said gently. */
export const SUGGESTED_TODAY = 3
export const MAX_TODAY = 10
export const MAX_LINE = 140

// ── What the account already has ───────────────────────────────────────────

export interface ExistingGoal { id: string; title: string; context?: PlanDomain | null }
export interface ExistingItem {
  id: string
  title: string
  horizon: 'season' | 'month' | 'week'
  /** The year goal it serves (tasks.goal_id), if any. */
  goalId: string | null
  /** Already chosen for today by this person. */
  today?: boolean
  context?: PlanDomain | null
}
export interface ExistingPlan {
  goals: ExistingGoal[]
  items: ExistingItem[]
  /** Lines the previous month / season left open, as the look-backs count them. */
  lookBack?: { month: number; season: number }
}
export const NO_PLAN: ExistingPlan = { goals: [], items: [] }

// ── The draft ──────────────────────────────────────────────────────────────

export interface PlanGoal { id: string; title: string; existing: boolean; context?: PlanDomain | null; leftOut?: boolean }
/** A new season or month line. A goal may have several (2026-10-08 review:
 *  "nutrition, equipment, training under one health aim"). goalId null = not
 *  tied to a year goal. `sourceId` (month lines): the Fall line — new or
 *  already on the plan — it is written for; null until there is exactly one
 *  candidate or the person picks one. */
export interface PlanLine { id: string; text: string; goalId: string | null; sourceId?: string | null }
/** A new week task. `from` = it was a season/month answer that was already
 *  doable. `sourceId`: the month line it is for (as `PlanLine.sourceId`). */
export interface WeekTask { id: string; text: string; goalId: string | null; from?: ListHorizon; sourceId?: string | null }

/** The periods this session writes into, fixed when it starts, as local
 *  dates — a session resumed next month still writes where it was planned
 *  (and says so) rather than shifting silently. */
export interface DraftPeriods { year: number; seasonStart: string; monthStart: string; weekStart: string; today: string }

export interface VoicePlanDraft {
  version: 3
  startAt: Horizon
  step: Step
  periods: DraftPeriods
  /** Existing year goals (kept unless left out of this session) and new ones. */
  goals: PlanGoal[]
  season: PlanLine[]
  month: PlanLine[]
  week: WeekTask[]
  /** Chosen for today: ids of new week tasks or existing week items — never a copy. */
  today: string[]
  /** `${horizon}:${goalId|FREE}` — this goal has nothing for this period, on purpose. */
  deferred: string[]
  skipped: Horizon[]
  /** The goal the question on screen is about (season, month) or new week tasks attach to. */
  focus: string
  domain: PlanDomain
  /** Row ids already written. A retry skips them, and they can no longer be
   *  changed here — an edit would never be written yet look saved. */
  saved: string[]
  /** Breadcrumb for Back: the steps visited, most recent last. */
  trail: Step[]
}

export const isCheck = (s: Step): s is CheckStep => s.endsWith(':check')
export const horizonOf = (s: Step): Horizon | 'review' => (isCheck(s) ? (s.split(':')[0] as Horizon) : s as Horizon | 'review')

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function draftPeriods(p: { year: number; seasonStart: Date; monthStart: Date; weekStart: Date; today: Date }): DraftPeriods {
  return { year: p.year, seasonStart: ymd(p.seasonStart), monthStart: ymd(p.monthStart), weekStart: ymd(p.weekStart), today: ymd(p.today) }
}
const FALLBACK_PERIODS: DraftPeriods = draftPeriods({ year: 2026, seasonStart: new Date(2026, 8, 1), monthStart: new Date(2026, 9, 1), weekStart: new Date(2026, 9, 3), today: new Date(2026, 9, 8) })

export function newDraft(startAt: Horizon, existing: ExistingPlan = NO_PLAN, periods: DraftPeriods = FALLBACK_PERIODS): VoicePlanDraft {
  const goals = existing.goals.map((g) => ({ id: g.id, title: g.title, existing: true, context: g.context ?? null }))
  return {
    version: 3, startAt, step: startAt, periods, goals, season: [], month: [], week: [], today: [], deferred: [], skipped: [],
    focus: startAt === 'week' || startAt === 'today' ? FREE : goals[0]?.id ?? FREE, domain: 'personal', saved: [], trail: [],
  }
}

/** Which of these periods differ from now — what a resumed session must say. */
export function stalePeriods(d: VoicePlanDraft, now: DraftPeriods): (keyof DraftPeriods)[] {
  return (['year', 'seasonStart', 'monthStart', 'weekStart', 'today'] as const).filter((k) => d.periods[k] !== now[k])
}

/** The horizons this session covers, in order. */
export function stepsFor(startAt: Horizon): Horizon[] {
  return HORIZONS.slice(HORIZONS.indexOf(startAt))
}

export function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE)
}

export const activeGoals = (d: VoicePlanDraft) => d.goals.filter((g) => !g.leftOut)
/** The rows a season or month question walks: every goal in the session, then "Something else". */
export const rowKeys = (d: VoicePlanDraft): string[] => [...activeGoals(d).map((g) => g.id), FREE]
const goalIdOf = (key: string): string | null => (key === FREE ? null : key)
const deferKey = (h: Horizon, key: string) => `${h}:${key}`
const isSaved = (d: VoicePlanDraft, id: string) => d.saved.includes(id)

/** The step after this one: a horizon's checkpoint, then the next horizon. */
function nextStep(d: VoicePlanDraft, s: Step): Step {
  const h = horizonOf(s)
  if (h === 'review') return 'review'
  if (!isCheck(s) && h !== 'today') return `${h}:check` as CheckStep
  const steps = stepsFor(d.startAt)
  const i = steps.indexOf(h)
  return i >= 0 && i < steps.length - 1 ? steps[i + 1] : 'review'
}

function go(d: VoicePlanDraft, step: Step, existing: ExistingPlan): VoicePlanDraft {
  if (step === d.step) return d
  const h = horizonOf(step)
  // Arriving at a list horizon, the question starts on the first goal still
  // open. On the week a new task serves no goal until the person picks one.
  const focus = isCheck(step) ? d.focus
    : h === 'season' || h === 'month' ? firstOpen(d, h, existing) ?? d.focus
    : h === 'week' ? FREE : d.focus
  return { ...d, step, focus, trail: [...d.trail, d.step] }
}

const unskip = (d: VoicePlanDraft, h: Horizon) => d.skipped.filter((s) => s !== h)

// ── Where each goal stands at a horizon ────────────────────────────────────

export type RowState = 'new' | 'existing' | 'week' | 'deferred' | 'open'

/** A goal's state for the season or month: written now, already on the plan,
 *  gone straight to this week, deliberately left for later, or still open. */
export function rowState(d: VoicePlanDraft, h: ListHorizon, key: string, existing: ExistingPlan): RowState {
  const gid = goalIdOf(key)
  if (d[h].some((l) => l.goalId === gid)) return 'new'
  if (d.week.some((w) => w.goalId === gid && (w.from === h || (h === 'month' && w.from === 'season')))) return 'week'
  if (d.deferred.includes(deferKey(h, key))) return 'deferred'
  if (existing.items.some((i) => i.horizon === h && (i.goalId ?? null) === gid)) return 'existing'
  return 'open'
}

function firstOpen(d: VoicePlanDraft, h: ListHorizon, existing: ExistingPlan, after?: string): string | undefined {
  const keys = activeGoals(d).map((g) => g.id)
  const from = after ? keys.indexOf(after) + 1 : 0
  return [...keys.slice(from), ...keys.slice(0, from)].find((k) => k !== after && rowState(d, h, k, existing) === 'open')
}

/** Move the question on to the next goal still open — never to another horizon. */
function advanceFocus(d: VoicePlanDraft, h: ListHorizon, from: string, existing: ExistingPlan): VoicePlanDraft {
  const next = firstOpen(d, h, existing, from)
  return next ? { ...d, focus: next } : d
}

/** The lines one level up a month line or week task can be written for, for
 *  its goal: the new ones in this session and the ones already on the plan —
 *  the actual rows, never a guess. */
export interface SourceCandidate { id: string; title: string; existing: boolean }
export function sourceCandidates(d: VoicePlanDraft, existing: ExistingPlan, level: 'month' | 'week', goalId: string | null): SourceCandidate[] {
  const above: ListHorizon = level === 'month' ? 'season' : 'month'
  return [
    ...d[above].filter((l) => l.goalId === goalId).map((l) => ({ id: l.id, title: l.text, existing: false })),
    ...existing.items.filter((i) => i.horizon === above && (i.goalId ?? null) === goalId).map((i) => ({ id: i.id, title: i.title, existing: true })),
  ]
}
/** Only one place it can be for: that one. Several: nothing until chosen. */
const soleSource = (c: SourceCandidate[]) => (c.length === 1 ? c[0].id : null)

// ── Actions ────────────────────────────────────────────────────────────────

export type FlowAction =
  /** A typed line or a spoken card: ADDS (never replaces) at the level on
   *  screen. `level` (voice) may name another horizon; `goal` names the goal
   *  it is for, else the goal in focus. */
  | { type: 'answer'; text: string; level?: Horizon; goal?: string }
  | { type: 'addGoal'; text: string }
  | { type: 'renameGoal'; id: string; text: string }
  | { type: 'removeGoal'; id: string }
  | { type: 'leaveOut'; id: string; out: boolean }
  | { type: 'focus'; goal: string }
  /** On to the next goal at this horizon (any goal, open first). */
  | { type: 'nextGoal' }
  | { type: 'defer'; goal: string }
  | { type: 'undefer'; goal: string }
  /** Change one line's words — explicit, by its id. */
  | { type: 'editLine'; level: ListHorizon; id: string; text: string }
  | { type: 'removeLine'; level: ListHorizon; id: string }
  /** Which Fall line a month line is for (null = none chosen). */
  | { type: 'setLineSource'; id: string; sourceId: string | null }
  | { type: 'toWeek'; id: string }
  | { type: 'addWeek'; text: string; goal?: string; sourceId?: string | null }
  | { type: 'editWeek'; id: string; text: string }
  | { type: 'removeWeek'; id: string }
  | { type: 'setWeekGoal'; id: string; goal: string }
  /** Which month line a week task is for (null = none chosen). */
  | { type: 'setWeekSource'; id: string; sourceId: string | null }
  | { type: 'toggleToday'; id: string }
  | { type: 'continue' }
  | { type: 'skip' }
  | { type: 'back' }
  | { type: 'edit'; level: Horizon; goal?: string }
  | { type: 'review' }
  | { type: 'setDomain'; domain: PlanDomain }
  | { type: 'markSaved'; ids: string[] }

export interface ReduceEnv { existing: ExistingPlan; newId: () => string }
const DEFAULT_ENV: ReduceEnv = { existing: NO_PLAN, newId: () => crypto.randomUUID() }

/** Which goal an answer is for: a row key (a tap), else a spoken name — an
 *  exact or partial title match — else none. */
export function matchGoal(d: VoicePlanDraft, said: string | undefined): string | undefined {
  if (!said) return undefined
  if (rowKeys(d).includes(said)) return said
  const s = said.trim().toLowerCase()
  if (!s) return undefined
  const goals = activeGoals(d)
  return (goals.find((g) => g.title.toLowerCase() === s) ?? goals.find((g) => g.title.toLowerCase().includes(s) || s.includes(g.title.toLowerCase())))?.id
}

/**
 * One reducer for every input: a tap, a typed line, or a card the guide
 * proposed. No answer ever changes the horizon on screen — only Continue,
 * Skip, Back, Edit and Review do — so a full session cannot jump past the
 * other goals. An answer ADDS a line; changing one is an explicit edit by id.
 * A row already written (`saved`) is not changed here.
 */
export function reduce(d: VoicePlanDraft, a: FlowAction, env: ReduceEnv = DEFAULT_ENV): VoicePlanDraft {
  const { existing, newId } = env
  switch (a.type) {
    case 'answer': {
      const here = horizonOf(d.step)
      const level = a.level ?? (here === 'review' ? undefined : here)
      const text = clean(a.text)
      if (!level || !text) return d
      // A spoken answer for a level above where we began widens the session.
      const base = HORIZONS.indexOf(level) < HORIZONS.indexOf(d.startAt) ? { ...d, startAt: level } : d
      if (level === 'year') return reduce(base, { type: 'addGoal', text }, env)
      const goal = matchGoal(base, a.goal) ?? base.focus
      if (level === 'week') return reduce(base, { type: 'addWeek', text, goal }, env)
      if (level === 'today') {
        // Today's action that IS on this week (new or already there) is that
        // task, chosen for today — never a second copy.
        const lower = text.toLowerCase()
        const onWeek = base.week.find((w) => w.text.toLowerCase() === lower)?.id
          ?? existing.items.find((i) => i.horizon === 'week' && i.title.toLowerCase() === lower)?.id
        if (onWeek) return base.today.includes(onWeek) ? base : reduce(base, { type: 'toggleToday', id: onWeek }, env)
        if (base.today.length >= MAX_TODAY) return base
        const added = reduce(base, { type: 'addWeek', text, goal }, env)
        const task = added.week[added.week.length - 1]
        return task && task.text === text ? { ...added, today: [...added.today, task.id], skipped: unskip(added, 'today') } : added
      }
      const gid = goalIdOf(goal)
      // The same words twice for one goal are one line.
      if (base[level].some((l) => l.goalId === gid && l.text.toLowerCase() === text.toLowerCase())) return base
      const line: PlanLine = { id: newId(), text, goalId: gid,
        ...(level === 'month' ? { sourceId: soleSource(sourceCandidates(base, existing, 'month', gid)) } : {}) }
      // Stays on this goal: another line for it is one more Enter away.
      return {
        ...base, [level]: [...base[level], line], skipped: unskip(base, level),
        deferred: base.deferred.filter((k) => k !== deferKey(level, goal)),
        focus: horizonOf(d.step) === level ? goal : base.focus,
      }
    }
    case 'addGoal': {
      const text = clean(a.text)
      if (!text || activeGoals(d).length >= MAX_GOALS || d.goals.some((g) => g.title.toLowerCase() === text.toLowerCase())) return d
      const g: PlanGoal = { id: newId(), title: text, existing: false }
      return { ...d, goals: [...d.goals, g], skipped: unskip(d, 'year'), focus: d.focus === FREE && !activeGoals(d).length ? g.id : d.focus }
    }
    case 'renameGoal': {
      const text = clean(a.text)
      // An existing goal is changed on the Year page, directly; a saved one is written.
      if (!text || isSaved(d, a.id)) return d
      return { ...d, goals: d.goals.map((g) => (g.id === a.id && !g.existing ? { ...g, title: text } : g)) }
    }
    case 'removeGoal': {
      const g = d.goals.find((x) => x.id === a.id)
      if (!g || g.existing || isSaved(d, a.id)) return d
      const keep = <T extends { id: string; goalId: string | null }>(xs: T[]) => xs.filter((x) => x.goalId !== a.id || isSaved(d, x.id))
      const week = keep(d.week)
      return {
        ...d, goals: d.goals.filter((x) => x.id !== a.id), season: keep(d.season), month: keep(d.month), week,
        today: d.today.filter((id) => week.some((w) => w.id === id) || existing.items.some((i) => i.id === id)),
        focus: d.focus === a.id ? (activeGoals(d).find((x) => x.id !== a.id)?.id ?? FREE) : d.focus,
      }
    }
    case 'leaveOut': {
      // Out of THIS session only. Nothing is deleted; it stays on the Year page.
      if (!d.goals.some((g) => g.id === a.id && g.existing)) return d
      const goals = d.goals.map((g) => (g.id === a.id ? { ...g, leftOut: a.out } : g))
      return { ...d, goals, focus: a.out && d.focus === a.id ? (goals.find((g) => !g.leftOut)?.id ?? FREE) : d.focus }
    }
    case 'focus':
      return rowKeys(d).includes(a.goal) ? { ...d, focus: a.goal } : d
    case 'nextGoal': {
      const h = horizonOf(d.step)
      if (h !== 'season' && h !== 'month') return d
      const keys = activeGoals(d).map((g) => g.id)
      const open = firstOpen(d, h, existing, d.focus)
      if (open) return { ...d, focus: open }
      const i = keys.indexOf(d.focus)
      return keys.length ? { ...d, focus: keys[(i + 1) % keys.length] } : d
    }
    case 'defer': {
      const h = horizonOf(d.step)
      if (h !== 'season' && h !== 'month') return d
      const gid = goalIdOf(a.goal)
      // Nothing this period: its unsaved lines go; a saved one stays (it is written).
      const cleared = { ...d, [h]: d[h].filter((l) => l.goalId !== gid || isSaved(d, l.id)), deferred: [...new Set([...d.deferred, deferKey(h, a.goal)])] }
      return advanceFocus(cleared, h, a.goal, existing)
    }
    case 'undefer': {
      const h = horizonOf(d.step)
      if (h !== 'season' && h !== 'month') return d
      return { ...d, deferred: d.deferred.filter((k) => k !== deferKey(h, a.goal)), focus: a.goal }
    }
    case 'editLine': {
      const text = clean(a.text)
      if (!text || isSaved(d, a.id)) return d
      return { ...d, [a.level]: d[a.level].map((l) => (l.id === a.id ? { ...l, text } : l)) }
    }
    case 'removeLine': {
      if (isSaved(d, a.id)) return d
      // A month line or week task written for it lets go of it.
      const drop = (xs: { sourceId?: string | null; id: string }[]) => xs.map((x) => (x.sourceId === a.id && !isSaved(d, x.id) ? { ...x, sourceId: null } : x))
      return { ...d, [a.level]: d[a.level].filter((l) => l.id !== a.id), month: a.level === 'season' ? drop(d.month) as PlanLine[] : d.month, week: a.level === 'month' ? drop(d.week) as WeekTask[] : d.week }
    }
    case 'setLineSource': {
      const line = d.month.find((l) => l.id === a.id)
      if (!line || isSaved(d, a.id)) return d
      if (a.sourceId && !sourceCandidates(d, existing, 'month', line.goalId).some((c) => c.id === a.sourceId)) return d
      return { ...d, month: d.month.map((l) => (l.id === a.id ? { ...l, sourceId: a.sourceId } : l)) }
    }
    case 'toWeek': {
      // The answer is already something to do: it becomes this week's task
      // for its goal. Only that line moves; the horizon stays.
      const h = horizonOf(d.step)
      if (h !== 'season' && h !== 'month') return d
      const line = d[h].find((l) => l.id === a.id)
      if (!line || isSaved(d, line.id) || d.week.length >= MAX_WEEK_NEW) return d
      const moved: VoicePlanDraft = {
        ...d, [h]: d[h].filter((l) => l !== line),
        week: [...d.week, { id: line.id, text: line.text, goalId: line.goalId, from: h, sourceId: h === 'month' ? null : soleSource(sourceCandidates(d, existing, 'week', line.goalId)) }],
        skipped: unskip(d, 'week'),
      }
      return moved
    }
    case 'addWeek': {
      const text = clean(a.text)
      if (!text || d.week.length >= MAX_WEEK_NEW) return d
      const lower = text.toLowerCase()
      if (d.week.some((w) => w.text.toLowerCase() === lower) || existing.items.some((i) => i.horizon === 'week' && i.title.toLowerCase() === lower)) return d
      const key = a.goal && rowKeys(d).includes(a.goal) ? a.goal : d.focus
      const goalId = goalIdOf(rowKeys(d).includes(key) ? key : FREE)
      const candidates = sourceCandidates(d, existing, 'week', goalId)
      const sourceId = a.sourceId && candidates.some((c) => c.id === a.sourceId) ? a.sourceId : soleSource(candidates)
      return { ...d, week: [...d.week, { id: newId(), text, goalId, sourceId }], skipped: unskip(d, 'week') }
    }
    case 'editWeek': {
      const text = clean(a.text)
      if (!text || isSaved(d, a.id)) return d
      return { ...d, week: d.week.map((w) => (w.id === a.id ? { ...w, text } : w)) }
    }
    case 'removeWeek':
      if (isSaved(d, a.id)) return d
      return { ...d, week: d.week.filter((w) => w.id !== a.id), today: d.today.filter((id) => id !== a.id) }
    case 'setWeekGoal': {
      if (!rowKeys(d).includes(a.goal) || isSaved(d, a.id)) return d
      const goalId = goalIdOf(a.goal)
      return { ...d, week: d.week.map((w) => (w.id === a.id ? { ...w, goalId, sourceId: soleSource(sourceCandidates(d, existing, 'week', goalId)) } : w)) }
    }
    case 'setWeekSource': {
      const w = d.week.find((x) => x.id === a.id)
      if (!w || isSaved(d, a.id)) return d
      if (a.sourceId && !sourceCandidates(d, existing, 'week', w.goalId).some((c) => c.id === a.sourceId)) return d
      return { ...d, week: d.week.map((x) => (x.id === a.id ? { ...x, sourceId: a.sourceId } : x)) }
    }
    case 'toggleToday': {
      const known = d.week.some((w) => w.id === a.id) || existing.items.some((i) => i.horizon === 'week' && i.id === a.id)
      if (!known || isSaved(d, `today:${a.id}`)) return d
      if (d.today.includes(a.id)) return { ...d, today: d.today.filter((id) => id !== a.id) }
      if (d.today.length >= MAX_TODAY) return d
      return { ...d, today: [...d.today, a.id], skipped: unskip(d, 'today') }
    }
    case 'continue':
      if (d.step === 'review') return d
      return go(d, nextStep(d, d.step), existing)
    case 'skip': {
      // Nothing new for this horizon: say so, and move to the next one.
      const h = horizonOf(d.step)
      if (h === 'review' || isCheck(d.step) || hasNewAt(d, h)) return d
      const skipped = { ...d, skipped: [...unskip(d, h), h] }
      // Past this horizon's checkpoint too: there is nothing new to look at.
      return go(skipped, nextStep(skipped, h === 'today' ? 'today' : `${h}:check` as CheckStep), existing)
    }
    case 'back': {
      const prev = d.trail[d.trail.length - 1]
      if (!prev) return d
      return { ...d, step: prev, trail: d.trail.slice(0, -1) }
    }
    case 'edit': {
      const widened = stepsFor(d.startAt).includes(a.level) ? d : { ...d, startAt: a.level }
      const moved = go(widened, a.level, existing)
      return a.goal && rowKeys(moved).includes(a.goal) ? { ...moved, focus: a.goal } : moved
    }
    case 'review':
      return go(d, 'review', existing)
    case 'setDomain':
      return { ...d, domain: a.domain }
    case 'markSaved':
      return { ...d, saved: [...new Set([...d.saved, ...a.ids])] }
  }
}

/**
 * The draft against what the person may see NOW (on resume, or when a filter
 * or account changes): existing goals they can no longer see leave the
 * session (their unsaved lines with them); titles and areas come from the
 * current rows; a chosen line above that is gone is unchosen; a today choice
 * of a task that is gone is dropped. Saved rows are kept as they are.
 */
export function reconcileDraft(d: VoicePlanDraft, existing: ExistingPlan): VoicePlanDraft {
  const now = new Map(existing.goals.map((g) => [g.id, g]))
  const goals = d.goals.flatMap((g) => {
    if (!g.existing) return [g]
    const cur = now.get(g.id)
    return cur ? [{ ...g, title: cur.title, context: cur.context ?? null }] : []
  })
  const known = new Set(goals.map((g) => g.id))
  const keepLine = <T extends { id: string; goalId: string | null }>(x: T) => x.goalId === null || known.has(x.goalId) || isSaved(d, x.id)
  const season = d.season.filter(keepLine)
  const base = { ...d, goals, season }
  const month = d.month.filter(keepLine).map((l) => (l.sourceId && !isSaved(d, l.id) && !sourceCandidates(base, existing, 'month', l.goalId).some((c) => c.id === l.sourceId) ? { ...l, sourceId: null } : l))
  const week = d.week.filter(keepLine).map((w) => (w.sourceId && !isSaved(d, w.id) && !sourceCandidates({ ...base, month }, existing, 'week', w.goalId).some((c) => c.id === w.sourceId) ? { ...w, sourceId: null } : w))
  const today = d.today.filter((id) => week.some((w) => w.id === id) || existing.items.some((i) => i.horizon === 'week' && i.id === id) || isSaved(d, `today:${id}`))
  const focus = rowKeys({ ...d, goals }).includes(d.focus) ? d.focus : (goals.find((g) => !g.leftOut)?.id ?? FREE)
  return { ...d, goals, season, month, week, today, focus }
}

/** Anything new written at this horizon in this session. */
export function hasNewAt(d: VoicePlanDraft, h: Horizon): boolean {
  if (h === 'year') return d.goals.some((g) => !g.existing)
  if (h === 'week') return d.week.length > 0
  if (h === 'today') return d.today.length > 0
  return d[h].length > 0
}

// ── Reading the draft ──────────────────────────────────────────────────────

/** Common first words of something you can just go and do. A heuristic, and
 *  only ever an OFFER ("Put it on this week") — the person decides. */
const ACTION_VERBS = [
  'call', 'email', 'text', 'message', 'reply', 'ask', 'book', 'buy', 'order', 'pay', 'send', 'sign',
  'print', 'write', 'draft', 'read', 'fill', 'submit', 'schedule', 'cancel', 'renew', 'measure',
  'compare', 'download', 'install', 'clean', 'clear', 'fix', 'list', 'sketch', 'pick', 'drop',
  'return', 'look', 'find', 'check', 'set', 'put', 'move', 'take', 'walk', 'pack', 'sort', 'wash',
]

export function looksExecutable(text: string | undefined): boolean {
  if (!text) return false
  const words = text.trim().toLowerCase().split(/\s+/)
  return words.length >= 2 && words.length <= 12 && ACTION_VERBS.includes(words[0].replace(/[^a-z]/g, ''))
}

export const linesFor = (d: VoicePlanDraft, h: ListHorizon, key: string) => d[h].filter((l) => l.goalId === goalIdOf(key))
export const goalTitle = (d: VoicePlanDraft, key: string | null) =>
  key === null || key === FREE ? 'Something else' : d.goals.find((g) => g.id === key)?.title ?? 'Something else'

/** The week as one list: what is already on it, then what is new. */
/** Ids written by this session — once saved they also arrive as existing rows. */
const ownIds = (d: VoicePlanDraft) => new Set([...d.goals.filter((g) => !g.existing).map((g) => g.id), ...d.season.map((l) => l.id), ...d.month.map((l) => l.id), ...d.week.map((w) => w.id)])

export interface WeekEntry { id: string; text: string; goalId: string | null; existing: boolean; from?: ListHorizon }
export function weekEntries(d: VoicePlanDraft, existing: ExistingPlan): WeekEntry[] {
  const inSession = new Set(activeGoals(d).map((g) => g.id))
  const own = ownIds(d)
  const kept = existing.items
    .filter((i) => i.horizon === 'week' && !own.has(i.id) && (i.goalId === null || inSession.has(i.goalId) || !d.goals.some((g) => g.id === i.goalId)))
    .map((i) => ({ id: i.id, text: i.title, goalId: i.goalId, existing: true }))
  const fresh = d.week.filter((w) => w.goalId === null || inSession.has(w.goalId)).map((w) => ({ ...w, existing: false }))
  return [...kept, ...fresh]
}

/** What one goal holds across the horizons — existing and new, side by side. */
export interface GoalColumn {
  key: string
  title: string
  existing: boolean
  season: { text: string; existing: boolean }[]
  month: { text: string; existing: boolean }[]
  week: { id: string; text: string; existing: boolean; today: boolean }[]
  deferred: ListHorizon[]
}
export function goalColumns(d: VoicePlanDraft, existing: ExistingPlan): GoalColumn[] {
  const col = (key: string, title: string, isExisting: boolean): GoalColumn => {
    const gid = goalIdOf(key)
    const own = ownIds(d)
    const list = (h: ListHorizon) => [
      // Lines already on the plan stay in view as kept — "Something else" too.
      ...existing.items.filter((i) => i.horizon === h && (i.goalId ?? null) === gid && !own.has(i.id)).map((i) => ({ text: i.title, existing: true })),
      ...d[h].filter((l) => l.goalId === gid).map((l) => ({ text: l.text, existing: false })),
    ]
    return {
      key, title, existing: isExisting, season: list('season'), month: list('month'),
      week: weekEntries(d, existing).filter((w) => w.goalId === gid).map((w) => ({ id: w.id, text: w.text, existing: w.existing, today: isToday(d, existing, w.id) })),
      deferred: (['season', 'month'] as const).filter((h) => d.deferred.includes(deferKey(h, key))),
    }
  }
  const cols = activeGoals(d).map((g) => col(g.id, g.title, g.existing))
  const free = col(FREE, 'Something else', false)
  return free.season.length || free.month.length || free.week.length ? [...cols, free] : cols
}

/** Chosen for today: this session's choices plus what was already chosen. */
export function isToday(d: VoicePlanDraft, existing: ExistingPlan, id: string): boolean {
  return d.today.includes(id) || existing.items.some((i) => i.id === id && i.today)
}

export function todayEntries(d: VoicePlanDraft, existing: ExistingPlan): WeekEntry[] {
  return weekEntries(d, existing).filter((w) => d.today.includes(w.id))
}

/** Something to save: anything new. */
export function hasContent(d: VoicePlanDraft): boolean {
  return HORIZONS.some((h) => hasNewAt(d, h))
}

// ── Progress ───────────────────────────────────────────────────────────────

export interface HorizonProgress {
  h: Horizon
  state: 'before' | 'done' | 'current' | 'upcoming' | 'skipped'
  /** "4 goals", "3 of 4 goals", "6 tasks", "2 chosen". */
  detail: string
}

export function progress(d: VoicePlanDraft, existing: ExistingPlan): HorizonProgress[] {
  const steps = stepsFor(d.startAt)
  const here = horizonOf(d.step)
  const goals = activeGoals(d).length
  return HORIZONS.map((h) => {
    const inPath = steps.includes(h)
    const pos = here === 'review' ? Infinity : HORIZONS.indexOf(here)
    const state: HorizonProgress['state'] = !inPath ? 'before'
      : d.skipped.includes(h) ? 'skipped'
      : h === here ? 'current'
      : HORIZONS.indexOf(h) < pos ? 'done' : 'upcoming'
    let detail = ''
    if (h === 'year') detail = goals ? `${goals} ${goals === 1 ? 'goal' : 'goals'}` : 'No goals yet'
    else if (h === 'season' || h === 'month') {
      const settled = activeGoals(d).filter((g) => rowState(d, h, g.id, existing) !== 'open').length
      detail = goals ? `${settled} of ${goals} goals` : `${d[h].length} new`
    } else if (h === 'week') {
      const n = weekEntries(d, existing).length
      detail = `${n} ${n === 1 ? 'task' : 'tasks'}`
    } else {
      const n = weekEntries(d, existing).filter((w) => isToday(d, existing, w.id)).length
      detail = n ? `${n} chosen` : 'Nothing yet'
    }
    return { h, state, detail }
  })
}

/** One line for "Continue your unfinished session". */
export function resumeSummary(d: VoicePlanDraft, labels: PeriodLabels): string {
  const h = horizonOf(d.step)
  const where = h === 'review' ? 'at the review' : isCheck(d.step) ? `checking ${labels[h as Horizon]}` : `on ${labels[h as Horizon]}`
  const goals = activeGoals(d).length
  const fresh = d.goals.filter((g) => !g.existing).length + d.season.length + d.month.length + d.week.length
  return `Started from ${LEVEL_WORD[d.startAt]} · stopped ${where} · ${goals} ${goals === 1 ? 'goal' : 'goals'}, ${fresh} new ${fresh === 1 ? 'line' : 'lines'} not saved yet`
}
const LEVEL_WORD: Record<Horizon, string> = { year: 'the year', season: 'the season', month: 'the month', week: 'the week', today: 'today' }

export interface PeriodLabels { year: string; season: string; month: string; week: string; today: string }

export interface Question { prompt: string; hint: string; placeholder: string }

/** One question per screen. Plain, short, and about the person's own plan —
 *  never advice about the subject itself. */
export function questionFor(d: VoicePlanDraft, h: Horizon, labels: PeriodLabels): Question {
  const goal = goalTitle(d, d.focus)
  const free = d.focus === FREE
  switch (h) {
    case 'year':
      return {
        prompt: `What do you want ${labels.year} to hold?`,
        hint: `Name your goals one at a time. Four or five is a good number; fewer is fine.`,
        placeholder: 'A goal, in a few words',
      }
    case 'season':
      return free
        ? { prompt: `Anything else for ${labels.season}?`, hint: 'Something not tied to a year goal. Optional.', placeholder: 'A line for the season' }
        : { prompt: `By the end of ${labels.season}, what would show “${goal}” moving?`, hint: 'A milestone you could point to — or nothing this season.', placeholder: 'A milestone, in a line' }
    case 'month':
      return free
        ? { prompt: `Anything else for ${labels.month}?`, hint: 'Something not tied to a year goal. Optional.', placeholder: 'A line for the month' }
        : { prompt: `What is ${labels.month}’s part of “${goal}”?`, hint: 'A priority for the month, in a line — or nothing this month.', placeholder: 'A priority, in a line' }
    case 'week':
      return { prompt: 'What will you do this week?', hint: 'One list for all your goals. Keep it to what fits around everything else.', placeholder: 'A task, in a line' }
    case 'today':
      return { prompt: 'What will you do today?', hint: `Choose from this week — two or ${SUGGESTED_TODAY} is plenty. Or add something small.`, placeholder: 'Something small to do today' }
  }
}

// ── Draft storage ──────────────────────────────────────────────────────────
// A saved draft lives on this device, per account; it holds only the plan
// text the person wrote, the ids, and references to their own existing rows.
// Nothing reaches the plan until Save. (Asking the guide, where it is
// switched on, sends what is on screen to it — said where it is asked.)

const draftKey = (userId: string) => `symphony.voicePlan.draft.${userId}`

export function readDraft(userId: string, storage: Pick<Storage, 'getItem'> = localStorage): VoicePlanDraft | null {
  try {
    const raw = storage.getItem(draftKey(userId))
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<VoicePlanDraft>
    // Earlier versions (no fixed periods; one line per goal) are not carried over.
    const p = d.periods as Partial<DraftPeriods> | undefined
    const ymdOk = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    if (d.version !== 3 || !d.startAt || !HORIZONS.includes(d.startAt) || !Array.isArray(d.goals) || !Array.isArray(d.week)
      || !Array.isArray(d.season) || !Array.isArray(d.month) || !Array.isArray(d.today) || !Array.isArray(d.saved) || typeof d.step !== 'string'
      || !p || typeof p.year !== 'number' || !ymdOk(p.seasonStart) || !ymdOk(p.monthStart) || !ymdOk(p.weekStart) || !ymdOk(p.today)) return null
    return d as VoicePlanDraft
  } catch {
    return null
  }
}

export function writeDraft(userId: string, d: VoicePlanDraft | null, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage): boolean {
  try {
    if (d) storage.setItem(draftKey(userId), JSON.stringify(d))
    else storage.removeItem(draftKey(userId))
    return true
  } catch {
    return false
  }
}

/** What the page says when an answer cannot be taken because a session
 *  bound is reached — never a silent drop. null = room left. */
export function limitNote(d: VoicePlanDraft, what: 'goal' | 'week' | 'today'): string | null {
  if (what === 'goal' && activeGoals(d).length >= MAX_GOALS) return `${MAX_GOALS} goals is the most one session carries — leave one out of this session to add another.`
  if (what === 'week' && d.week.length >= MAX_WEEK_NEW) return `${MAX_WEEK_NEW} new tasks is the most one session adds to a week — save these, or remove one to add another.`
  if (what === 'today' && d.today.length >= MAX_TODAY) return `${MAX_TODAY} things is the most one session chooses for a day — unchoose one to choose another.`
  return null
}
