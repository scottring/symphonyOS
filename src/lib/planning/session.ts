// src/lib/planning/session.ts
//
// A planning session, as data (spec: guided planning, Phase 1). Nothing here
// writes — the draft is decided in full, summarised, and only then applied
// (applySession.ts). One shape for all four levels: week, month, season and
// year differ only in the rows they look back at and the words they use.

import type { Task, PlacementLevel } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { DomainId, Layer } from '@/lib/domains'
import type { Seasons } from '@/lib/cadence/seasons'
import { committedTo } from '@/lib/placement/model'
import { matchesLayers } from '@/lib/today/domainFilter'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import { doableBy } from './poolViews'
import { stepsThatCarryForward } from './goalSteps'

export type Verdict = 'keep' | 'keep-action' | 'done' | 'someday' | 'drop'
/** `context` is the domain the item was planned in (null = none in view), or,
 *  for a task toward a goal, the goal's — fixed when it is added, never the
 *  domain in view at Save (final review I4). Absent on a draft from before. */
export interface NewItem { id: string; title: string; linkId?: string; context?: DomainId | null
  /** Week only: an optional day (local YYYY-MM-DD) for a time-sensitive task. */
  day?: string }
export type SessionLevel = 'month' | 'week' | 'season' | 'year'

/** The placement level a session's rows live on. A year row is a GOAL, not a
 *  placed task — it has no commitments — so nothing asks placement about it;
 *  'month' is the harmless stand-in for the step helpers, which find nothing. */
export function placementLevelOf(level: SessionLevel): PlacementLevel {
  return level === 'year' ? 'month' : level
}
export interface SessionDraft {
  level: SessionLevel; periodStart: string; prevStart: string
  verdicts: Record<string, Verdict>
  actionTitles: Record<string, string>
  wentWell: string; didnt: string
  newGoals: NewItem[]; newTasks: NewItem[]
  takenFromAbove: string[]
  keptAlready: string[]
  actionIds: Record<string, string>
  /** Year only: source goal id → the id the kept copy will be created with, so
   *  a retried Save re-uses it instead of making a second goal (Task 2/4). */
  keptIds?: Record<string, string>
  created: string[]
}
export interface SummaryLine { title: string; destination: string }

export function emptyDraft(level: SessionLevel, periodStart: Date, prevStart: Date): SessionDraft {
  return { level, periodStart: localYmd(periodStart), prevStart: localYmd(prevStart),
    verdicts: {}, actionTitles: {}, wentWell: '', didnt: '', newGoals: [], newTasks: [], takenFromAbove: [], keptAlready: [], actionIds: {}, keptIds: {}, created: [] }
}

export function isEmptyDraft(d: SessionDraft): boolean {
  return !d.wentWell.trim() && !d.didnt.trim() && Object.keys(d.verdicts).length === 0
    && d.newGoals.length === 0 && d.newTasks.length === 0 && d.takenFromAbove.length === 0
}

/** The previous month's ACTUAL list: what finished, and what is still open on it.
 *  A row carried or dropped already has its answer and is not asked again.
 *  Scoped to `meId` exactly as the month page is (selectPeriodTasks): a row
 *  assigned only to someone else is not on my September, so it is not asked. */
export function lookBackRows(tasks: readonly Task[], prevStart: Date, meId: string | null, level: SessionLevel = 'month', seasons?: Seasons): { finished: Task[]; open: Task[] } {
  const finished: Task[] = []
  const open: Task[] = []
  // A year's look-back is over GOALS, not placed tasks — yearLookBack answers it.
  if (level === 'year') return { finished, open }
  for (const t of tasks) {
    if (meId && !doableBy(t, meId)) continue
    // The week plans tasks only; goals live a level up.
    if (level === 'week' && t.isGoal) continue
    const c = committedTo(t, placementLevelOf(level), prevStart, { isCurrent: false, seasons })
    if (!c) continue
    if (c !== 'legacy' && c.status === 'carried') continue
    if (t.completed || (c !== 'legacy' && c.status === 'done')) finished.push(t)
    else open.push(t)
  }
  const byCreated = (a: Task, b: Task) => a.createdAt.getTime() - b.createdAt.getTime()
  return { finished: finished.sort(byCreated), open: open.sort(byCreated) }
}

export function verdictOptions(isGoal: boolean, level: SessionLevel = 'month'): Array<{ verdict: Verdict; label: string }> {
  // A year row is a goal with no task list of its own to hang an action on,
  // and no Someday page above the year: it is kept, finished, or let go.
  if (level === 'year') {
    return [{ verdict: 'keep', label: 'Keep' }, { verdict: 'done', label: 'Done' },
      { verdict: 'drop', label: 'Drop' }]
  }
  // A week row is a task: there is no goal to add a next action to.
  if (level === 'week') {
    return [{ verdict: 'keep', label: 'Keep' }, { verdict: 'done', label: 'Done' },
      { verdict: 'someday', label: 'Someday' }, { verdict: 'drop', label: 'Drop' }]
  }
  return isGoal
    ? [{ verdict: 'keep', label: 'Keep' }, { verdict: 'keep-action', label: 'Keep, and add a next action' },
       { verdict: 'someday', label: 'Someday' }, { verdict: 'drop', label: 'Drop' }]
    : [{ verdict: 'keep', label: 'Keep' }, { verdict: 'done', label: 'Done' },
       { verdict: 'someday', label: 'Someday' }, { verdict: 'drop', label: 'Drop' }]
}

/**
 * The rows a verdict may name: what the look-back shows now (`open`), plus a
 * goal a half-finished Save already carried into this month (now on
 * `current`) whose Keep is not finished — a step's carry failed, or its next
 * action is still to write. Its verdict stays so Save again retries: a Keep
 * is idempotent (the goal's source is already carried; only what is still
 * open moves) — re-review N1.
 */
function verdictRows(d: SessionDraft, ctx: { open: readonly Task[]; current?: readonly Task[] }): Task[] {
  const openIds = new Set(ctx.open.map((t) => t.id))
  const carried = (ctx.current ?? []).filter((t) => !openIds.has(t.id) && (d.verdicts[t.id] === 'keep' || d.verdicts[t.id] === 'keep-action'))
  return [...ctx.open, ...carried]
}

/**
 * Goals with steps still open in the previous month that the look-back does
 * NOT show (the domain in view, or a step assigned only to someone else).
 * keepForward carries every open step of a kept goal — the goal keeps its
 * work — so the summary must say it carries more than it lists. `all` is the
 * unfiltered task list; the step rule is keepForward's own.
 */
export function goalsWithHiddenSteps(all: readonly Task[], shown: readonly Task[], prevStart: Date, level: SessionLevel = 'month', seasons?: Seasons): Set<string> {
  // A week plans tasks, and a year plans goals: neither carries steps here.
  if (level === 'week' || level === 'year') return new Set()
  const shownIds = new Set(shown.map((t) => t.id))
  const goalIds = new Set(all.filter((t) => t.goalTaskId).map((t) => t.goalTaskId!))
  const out = new Set<string>()
  for (const g of goalIds) {
    const hidden = stepsThatCarryForward(g, all, level).some((st) => {
      if (shownIds.has(st.id)) return false
      const c = committedTo(st, level, prevStart, { isCurrent: false, seasons })
      return c === 'legacy' || (c !== undefined && c.status === 'open')
    })
    if (hidden) out.add(g)
  }
  return out
}

/**
 * The draft as the session can SHOW it. A stored draft outlives the rows it
 * names — a task deleted since, or hidden by the domain now in view — and an
 * entry for a row not shown would either fail every Save (an invisible
 * blocker) or write something the summary never listed. The summary and Save
 * both read this one pruned draft, so what is shown is what is written
 * (final review I2). New goals and tasks are the session's own and stay.
 * Returns `d` itself when nothing is stale.
 */
export function pruneDraft(d: SessionDraft, ctx: { open: readonly Task[]; above: readonly Task[]; current?: readonly Task[] }): SessionDraft {
  const rows = new Set(verdictRows(d, ctx).map((t) => t.id))
  const aboveIds = new Set(ctx.above.map((t) => t.id))
  const pick = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => rows.has(k))) as Record<string, T>
  const keptAlready = d.keptAlready ?? []
  const actionIds = d.actionIds ?? {}
  const keptIds = d.keptIds ?? {}
  const stale = Object.keys(d.verdicts).some((k) => !rows.has(k)) || Object.keys(d.actionTitles).some((k) => !rows.has(k))
    || Object.keys(actionIds).some((k) => !rows.has(k)) || Object.keys(keptIds).some((k) => !rows.has(k))
    || keptAlready.some((k) => !rows.has(k))
    || d.takenFromAbove.some((k) => !aboveIds.has(k))
  if (!stale) return d
  return { ...d, verdicts: pick(d.verdicts), actionTitles: pick(d.actionTitles), actionIds: pick(actionIds), keptIds: pick(keptIds),
    keptAlready: keptAlready.filter((k) => rows.has(k)), takenFromAbove: d.takenFromAbove.filter((k) => aboveIds.has(k)) }
}

/** The week session's task-list heading, in the words of the week being
 *  planned. A week page pages backwards, and "This week's tasks" beside a rail
 *  marker reading "on the week of Oct 4" is a screen arguing with itself. */
export function weekTaskListLabel(periodLabel: string): string {
  return periodLabel === 'this week' ? "This week's tasks" : `Tasks for ${periodLabel}`
}

export function summarize(
  d: SessionDraft,
  ctx: {
    open: Task[]; above: Task[]; aboveGoals: Task[]; current?: Task[]
    /** Goals with open steps this view hides (goalsWithHiddenSteps). */
    hiddenStepGoals?: ReadonlySet<string>
    periodLabel: string; prevLabel: string
    /** The level above, as the session names it: 'the season' for a month, 'October' for a week. */
    aboveLabel: string
  },
): SummaryLine[] {
  const P = ctx.periodLabel, Q = ctx.prevLabel
  const week = d.level === 'week'
  const year = d.level === 'year'
  const L = {
    list: week ? weekTaskListLabel(P) : `${P} tasks`,
    goals: `${P} goals`,
    kept: `kept from ${Q}`,
    done: week ? `Done ${Q}` : `Done in ${Q}`,
    // A year row is a goal: dropping it archives the goal; there is no task to keep.
    dropped: year ? `Dropped from ${Q} · the goal is archived` : `Dropped from ${Q} · the task is kept`,
    left: week ? `Left open ${Q}` : `Left open in ${Q}`,
    stays: `stays on ${ctx.aboveLabel}, marked "${week ? `on ${P}` : `in ${P}`}"`,
  }
  const lines: SummaryLine[] = []
  // A kept goal carries its steps still open in the previous month (keepForward).
  // A step with its own verdict is written first (applySession) and answers
  // for itself; one without is carried with the goal, and says so.
  const rows = verdictRows(d, ctx)
  const carriedWith = new Map<string, string>()
  for (const g of rows) {
    const v = d.verdicts[g.id]
    if (!g.isGoal || (v !== 'keep' && v !== 'keep-action')) continue
    for (const s of stepsThatCarryForward(g.id, ctx.open, placementLevelOf(d.level))) carriedWith.set(s.id, g.title)
  }
  // No count: one line says there is more, never how much (no scoreboards).
  const alsoCarries = (g: Task) => {
    if (g.isGoal && ctx.hiddenStepGoals?.has(g.id)) {
      lines.push({ title: `${g.title} also carries steps not shown in this view`, destination: `${L.list} · carried with ${g.title}` })
    }
  }
  for (const t of rows) {
    const v = d.verdicts[t.id]
    const list = t.isGoal ? L.goals : L.list
    if (v === 'keep') { lines.push({ title: t.title, destination: `${list} · ${L.kept}` }); alsoCarries(t) }
    else if (v === 'keep-action') {
      lines.push({ title: t.title, destination: `${list} · ${L.kept}` })
      alsoCarries(t)
      const a = d.actionTitles[t.id]?.trim()
      if (a) lines.push({ title: a, destination: `${L.list} · new next action toward ${t.title}` })
    }
    else if (v === 'done') lines.push({ title: t.title, destination: L.done })
    else if (v === 'someday') lines.push({ title: t.title, destination: 'Someday page' })
    else if (v === 'drop') lines.push({ title: t.title, destination: L.dropped })
    else if (carriedWith.has(t.id)) lines.push({ title: t.title, destination: `${L.list} · carried with ${carriedWith.get(t.id)}` })
    else lines.push({ title: t.title, destination: L.left })
  }
  const goalTitle = new Map(d.newGoals.map((g) => [g.id, g.title]))
  for (const g of d.newGoals) {
    // "for <season goal>" is shown, not stored (Phase 1): levels are separate lists.
    const forTitle = g.linkId ? ctx.aboveGoals.find((x) => x.id === g.linkId)?.title : undefined
    lines.push({ title: g.title, destination: `${L.goals}${forTitle ? ` · for ${forTitle}` : ''}` })
  }
  for (const n of d.newTasks) {
    const toward = n.linkId ? goalTitle.get(n.linkId) ?? ctx.open.find((t) => t.id === n.linkId)?.title : undefined
    // A week task may name a day; the weekday is the whole of what it adds.
    const onDay = n.day ? `, on ${parseLocalYmd(n.day).toLocaleDateString('en-US', { weekday: 'short' })}` : ''
    lines.push({ title: n.title, destination: `${L.list}${toward ? ` · toward ${toward}` : ''}${onDay}` })
  }
  for (const id of d.takenFromAbove) {
    const t = ctx.above.find((x) => x.id === id)
    if (t) lines.push({ title: t.title, destination: `${L.list} · ${L.stays}` })
  }
  return lines
}

/**
 * A Goal as the session's row shape. PlanSession and `summarize` read only
 * `id, title, isGoal, completed, createdAt, updatedAt, context` off a row, so
 * one documented cast is honest here: the object is a Task for every field
 * either of them touches, and nothing else is invented.
 */
export function goalAsRow(g: Goal): Task {
  return {
    id: g.id, title: g.name, isGoal: true, completed: g.status === 'completed',
    createdAt: g.createdAt, updatedAt: g.updatedAt, context: g.context ?? null, bucket: 'inbox',
  } as Task
}

/**
 * The year's look-back: last year's goals, as rows. An archived goal was
 * already let go and is not asked about again. Scoped to the layers in view
 * exactly as the year page is (PeriodPlanPage's year rows).
 */
export function yearLookBack(goals: readonly Goal[], year: number, layers: ReadonlySet<Layer>): { finished: Task[]; open: Task[] } {
  const byCreated = (a: Task, b: Task) => a.createdAt.getTime() - b.createdAt.getTime()
  const mine = goals.filter((g) => g.year === year && matchesLayers(g.context, layers))
  return {
    finished: mine.filter((g) => g.status === 'completed').map(goalAsRow).sort(byCreated),
    open: mine.filter((g) => g.status === 'active').map(goalAsRow).sort(byCreated),
  }
}
