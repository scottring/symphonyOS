// src/lib/planning/session.ts
//
// A planning session, as data (spec: guided planning, Phase 1). Nothing here
// writes — the draft is decided in full, summarised, and only then applied
// (applySession.ts). Month only for now; season/year reuse this shape later.

import type { Task } from '@/types/task'
import { committedTo } from '@/lib/placement/model'
import { localYmd } from '@/lib/cadence/config'

export type Verdict = 'keep' | 'keep-action' | 'done' | 'someday' | 'drop'
export interface NewItem { id: string; title: string; linkId?: string }
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
 *  A row carried or dropped already has its answer and is not asked again. */
export function lookBackRows(tasks: readonly Task[], prevStart: Date): { finished: Task[]; open: Task[] } {
  const finished: Task[] = []
  const open: Task[] = []
  for (const t of tasks) {
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

export function summarize(
  d: SessionDraft,
  ctx: { open: Task[]; above: Task[]; aboveGoals: Task[]; periodLabel: string; prevLabel: string },
): SummaryLine[] {
  const P = ctx.periodLabel, Q = ctx.prevLabel
  const lines: SummaryLine[] = []
  for (const t of ctx.open) {
    const v = d.verdicts[t.id]
    const list = t.isGoal ? `${P} goals` : `${P} tasks`
    if (v === 'keep') lines.push({ title: t.title, destination: `${list} · kept from ${Q}` })
    else if (v === 'keep-action') {
      lines.push({ title: t.title, destination: `${list} · kept from ${Q}` })
      const a = d.actionTitles[t.id]?.trim()
      if (a) lines.push({ title: a, destination: `${P} tasks · new next action toward ${t.title}` })
    }
    else if (v === 'done') lines.push({ title: t.title, destination: `Done in ${Q}` })
    else if (v === 'someday') lines.push({ title: t.title, destination: 'Someday page' })
    else if (v === 'drop') lines.push({ title: t.title, destination: `Dropped from ${Q} · the task is kept` })
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
