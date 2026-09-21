// src/lib/planning/applySession.ts
//
// Save = everything at once, in an order where every link resolves: verdicts
// that END a row in the old month (drop, someday, done) first, then keeps (a
// kept goal carries every step still open there, so a step's own ending must
// already have landed — final review I1; a kept goal is in the new month
// before its next action), new goals, tasks
// under goals that EXIST, pulls from the season into the SESSION's month, and
// only then the session row. Every writer states whether it wrote. Progress is
// reported after each success so the page can persist it immediately; every
// created row carries a pre-generated id, so replaying a step that already
// landed finds the row instead of duplicating it.

import { parseLocalYmd } from '@/lib/cadence/config'
import type { DomainId } from '@/lib/domains'
import type { SessionDraft, Verdict } from './session'

export interface SessionWriters {
  keep: (id: string, monthStart: Date, prevStart: Date) => Promise<boolean>
  /** `context` is the item's own (recorded when planned), never the domain in view at Save. */
  addTask: (title: string, opts: { id: string; monthStart: Date; isGoal?: boolean; goalTaskId?: string; context: DomainId | null }) => Promise<string | undefined>
  /** An existing row's domain — a next action takes its goal's. */
  contextOf: (id: string) => DomainId | null
  complete: (id: string) => Promise<boolean>
  someday: (id: string) => Promise<boolean>
  drop: (id: string, prevStart: Date) => Promise<boolean>
  takeIntoMonth: (id: string, monthStart: Date) => Promise<boolean>
  saveSession: (notes: { wentWell: string; didnt: string }) => Promise<boolean>
}
export interface ApplyResult { ok: boolean; remaining: SessionDraft }

async function wrote<T>(f: () => Promise<T>): Promise<boolean> {
  try { const v = await f(); return v !== false && v !== undefined && v !== null } catch { return false }
}

export async function applySession(
  d: SessionDraft, w: SessionWriters, isCompleted: (id: string) => boolean,
  onProgress?: (remaining: SessionDraft) => void,
): Promise<ApplyResult> {
  const monthStart = parseLocalYmd(d.periodStart)
  const prevStart = parseLocalYmd(d.prevStart)
  // `cur` is the draft minus everything written so far — always safe to persist.
  let cur: SessionDraft = {
    ...d, verdicts: { ...d.verdicts }, actionTitles: { ...d.actionTitles }, actionIds: { ...d.actionIds },
    keptAlready: [...(d.keptAlready ?? [])], created: [...(d.created ?? [])],
    newGoals: [...d.newGoals], newTasks: [...d.newTasks], takenFromAbove: [...d.takenFromAbove],
  }
  const progress = (next: SessionDraft) => { cur = next; onProgress?.(cur) }
  const without = <T,>(o: Record<string, T>, k: string) => { const c = { ...o }; delete c[k]; return c }

  const ends = (v: Verdict) => v === 'drop' || v === 'someday' || v === 'done'
  const verdicts = Object.entries(d.verdicts)
  const ordered = [...verdicts.filter(([, v]) => ends(v)), ...verdicts.filter(([, v]) => !ends(v))]
  for (const [id, v] of ordered) {
    if (v === 'keep-action') {
      if (!cur.keptAlready.includes(id)) {
        if (!(await wrote(() => w.keep(id, monthStart, prevStart)))) continue
        progress({ ...cur, keptAlready: [...cur.keptAlready, id] })
      }
      const title = cur.actionTitles[id]?.trim()
      const actionId = cur.actionIds[id]
      if (title && actionId && !(await wrote(() => w.addTask(title, { id: actionId, monthStart, goalTaskId: id, context: w.contextOf(id) })))) continue
      progress({ ...cur, verdicts: without(cur.verdicts, id), actionTitles: without(cur.actionTitles, id),
        actionIds: without(cur.actionIds, id), keptAlready: cur.keptAlready.filter((x) => x !== id) })
      continue
    }
    const ok =
      v === 'keep' ? await wrote(() => w.keep(id, monthStart, prevStart))
      : v === 'drop' ? await wrote(() => w.drop(id, prevStart))
      : v === 'someday' ? await wrote(() => w.someday(id))
      : v === 'done' ? (isCompleted(id) || await wrote(() => w.complete(id)))
      : false
    if (ok) progress({ ...cur, verdicts: without(cur.verdicts, id) })
  }

  for (const g of d.newGoals) {
    if (cur.created.includes(g.id)) { progress({ ...cur, newGoals: cur.newGoals.filter((x) => x.id !== g.id) }); continue }
    if (await wrote(() => w.addTask(g.title, { id: g.id, monthStart, isGoal: true, context: g.context ?? null }))) {
      progress({ ...cur, created: [...cur.created, g.id], newGoals: cur.newGoals.filter((x) => x.id !== g.id) })
    }
  }
  const pendingGoals = new Set(cur.newGoals.map((g) => g.id))
  for (const t of d.newTasks) {
    if (t.linkId && pendingGoals.has(t.linkId)) continue            // its goal isn't written yet — wait
    if (await wrote(() => w.addTask(t.title, { id: t.id, monthStart, goalTaskId: t.linkId, context: t.context ?? null }))) {
      progress({ ...cur, newTasks: cur.newTasks.filter((x) => x.id !== t.id) })
    }
  }
  for (const id of d.takenFromAbove) {
    if (await wrote(() => w.takeIntoMonth(id, monthStart))) progress({ ...cur, takenFromAbove: cur.takenFromAbove.filter((x) => x !== id) })
  }

  const left = Object.keys(cur.verdicts).length + cur.newGoals.length + cur.newTasks.length + cur.takenFromAbove.length
  if (left > 0) return { ok: false, remaining: cur }
  if (!(await wrote(() => w.saveSession({ wentWell: d.wentWell.trim(), didnt: d.didnt.trim() })))) return { ok: false, remaining: cur }
  return { ok: true, remaining: { ...cur, wentWell: '', didnt: '' } }
}
