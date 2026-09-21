// src/lib/planning/session.ts
//
// A planning session, as data (spec: guided planning, Phase 1). Nothing here
// writes — the draft is decided in full, summarised, and only then applied
// (applySession.ts). Month only for now; season/year reuse this shape later.

import type { Task } from '@/types/task'
import type { DomainId } from '@/lib/domains'
import { committedTo } from '@/lib/placement/model'
import { localYmd } from '@/lib/cadence/config'
import { doableBy } from './poolViews'
import { stepsThatCarryForward } from './goalSteps'

export type Verdict = 'keep' | 'keep-action' | 'done' | 'someday' | 'drop'
/** `context` is the domain the item was planned in (null = none in view), or,
 *  for a task toward a goal, the goal's — fixed when it is added, never the
 *  domain in view at Save (final review I4). Absent on a draft from before. */
export interface NewItem { id: string; title: string; linkId?: string; context?: DomainId | null }
export interface SessionDraft {
  level: 'month'; periodStart: string; prevStart: string
  verdicts: Record<string, Verdict>
  actionTitles: Record<string, string>
  wentWell: string; didnt: string
  newGoals: NewItem[]; newTasks: NewItem[]
  takenFromAbove: string[]
  keptAlready: string[]
  actionIds: Record<string, string>
  created: string[]
}
export interface SummaryLine { title: string; destination: string }

export function emptyDraft(periodStart: Date, prevStart: Date): SessionDraft {
  return { level: 'month', periodStart: localYmd(periodStart), prevStart: localYmd(prevStart),
    verdicts: {}, actionTitles: {}, wentWell: '', didnt: '', newGoals: [], newTasks: [], takenFromAbove: [], keptAlready: [], actionIds: {}, created: [] }
}

export function isEmptyDraft(d: SessionDraft): boolean {
  return !d.wentWell.trim() && !d.didnt.trim() && Object.keys(d.verdicts).length === 0
    && d.newGoals.length === 0 && d.newTasks.length === 0 && d.takenFromAbove.length === 0
}

/** The previous month's ACTUAL list: what finished, and what is still open on it.
 *  A row carried or dropped already has its answer and is not asked again.
 *  Scoped to `meId` exactly as the month page is (selectPeriodTasks): a row
 *  assigned only to someone else is not on my September, so it is not asked. */
export function lookBackRows(tasks: readonly Task[], prevStart: Date, meId: string | null): { finished: Task[]; open: Task[] } {
  const finished: Task[] = []
  const open: Task[] = []
  for (const t of tasks) {
    if (meId && !doableBy(t, meId)) continue
    const c = committedTo(t, 'month', prevStart, { isCurrent: false })
    if (!c) continue
    if (c !== 'legacy' && c.status === 'carried') continue
    if (t.completed || (c !== 'legacy' && c.status === 'done')) finished.push(t)
    else open.push(t)
  }
  const byCreated = (a: Task, b: Task) => a.createdAt.getTime() - b.createdAt.getTime()
  return { finished: finished.sort(byCreated), open: open.sort(byCreated) }
}

export function verdictOptions(isGoal: boolean): Array<{ verdict: Verdict; label: string }> {
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
export function goalsWithHiddenSteps(all: readonly Task[], shown: readonly Task[], prevStart: Date): Set<string> {
  const shownIds = new Set(shown.map((t) => t.id))
  const goalIds = new Set(all.filter((t) => t.goalTaskId).map((t) => t.goalTaskId!))
  const out = new Set<string>()
  for (const g of goalIds) {
    const hidden = stepsThatCarryForward(g, all, 'month').some((st) => {
      if (shownIds.has(st.id)) return false
      const c = committedTo(st, 'month', prevStart, { isCurrent: false })
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
  const stale = Object.keys(d.verdicts).some((k) => !rows.has(k)) || Object.keys(d.actionTitles).some((k) => !rows.has(k))
    || Object.keys(actionIds).some((k) => !rows.has(k)) || keptAlready.some((k) => !rows.has(k))
    || d.takenFromAbove.some((k) => !aboveIds.has(k))
  if (!stale) return d
  return { ...d, verdicts: pick(d.verdicts), actionTitles: pick(d.actionTitles), actionIds: pick(actionIds),
    keptAlready: keptAlready.filter((k) => rows.has(k)), takenFromAbove: d.takenFromAbove.filter((k) => aboveIds.has(k)) }
}

export function summarize(
  d: SessionDraft,
  ctx: {
    open: Task[]; above: Task[]; aboveGoals: Task[]; current?: Task[]
    /** Goals with open steps this view hides (goalsWithHiddenSteps). */
    hiddenStepGoals?: ReadonlySet<string>
    periodLabel: string; prevLabel: string
  },
): SummaryLine[] {
  const P = ctx.periodLabel, Q = ctx.prevLabel
  const lines: SummaryLine[] = []
  // A kept goal carries its steps still open in the previous month (keepForward).
  // A step with its own verdict is written first (applySession) and answers
  // for itself; one without is carried with the goal, and says so.
  const rows = verdictRows(d, ctx)
  const carriedWith = new Map<string, string>()
  for (const g of rows) {
    const v = d.verdicts[g.id]
    if (!g.isGoal || (v !== 'keep' && v !== 'keep-action')) continue
    for (const s of stepsThatCarryForward(g.id, ctx.open, 'month')) carriedWith.set(s.id, g.title)
  }
  // No count: one line says there is more, never how much (no scoreboards).
  const alsoCarries = (g: Task) => {
    if (g.isGoal && ctx.hiddenStepGoals?.has(g.id)) {
      lines.push({ title: `${g.title} also carries steps not shown in this view`, destination: `${P} tasks · carried with ${g.title}` })
    }
  }
  for (const t of rows) {
    const v = d.verdicts[t.id]
    const list = t.isGoal ? `${P} goals` : `${P} tasks`
    if (v === 'keep') { lines.push({ title: t.title, destination: `${list} · kept from ${Q}` }); alsoCarries(t) }
    else if (v === 'keep-action') {
      lines.push({ title: t.title, destination: `${list} · kept from ${Q}` })
      alsoCarries(t)
      const a = d.actionTitles[t.id]?.trim()
      if (a) lines.push({ title: a, destination: `${P} tasks · new next action toward ${t.title}` })
    }
    else if (v === 'done') lines.push({ title: t.title, destination: `Done in ${Q}` })
    else if (v === 'someday') lines.push({ title: t.title, destination: 'Someday page' })
    else if (v === 'drop') lines.push({ title: t.title, destination: `Dropped from ${Q} · the task is kept` })
    else if (carriedWith.has(t.id)) lines.push({ title: t.title, destination: `${P} tasks · carried with ${carriedWith.get(t.id)}` })
    else lines.push({ title: t.title, destination: `Left open in ${Q}` })
  }
  const goalTitle = new Map(d.newGoals.map((g) => [g.id, g.title]))
  for (const g of d.newGoals) {
    // "for <season goal>" is shown, not stored (Phase 1): levels are separate lists.
    const forTitle = g.linkId ? ctx.aboveGoals.find((x) => x.id === g.linkId)?.title : undefined
    lines.push({ title: g.title, destination: `${P} goals${forTitle ? ` · for ${forTitle}` : ''}` })
  }
  for (const n of d.newTasks) {
    const toward = n.linkId ? goalTitle.get(n.linkId) ?? ctx.open.find((t) => t.id === n.linkId)?.title : undefined
    lines.push({ title: n.title, destination: `${P} tasks${toward ? ` · toward ${toward}` : ''}` })
  }
  for (const id of d.takenFromAbove) {
    const t = ctx.above.find((x) => x.id === id)
    if (t) lines.push({ title: t.title, destination: `${P} tasks · stays on the season, marked "in ${P}"` })
  }
  return lines
}
