// src/lib/voiceOnboarding/savePlan.ts
//
// Save the confirmed plan through the app's own writers — the same addGoal /
// addTask / updateTask every planning page uses, signed in as the person,
// under RLS. No server-side or service-role write exists for this flow.
//
// Only what is NEW is written. Existing goals and lines are referenced by
// their ids and never copied. Every link is the one the draft holds for that
// row — a month line's Fall line and a week task's month line are the rows
// the person chose (or the only one there was), never "the first one found".
//
// Choosing a task for today is its own step after the task exists:
// `planForToday` (updateTask with plannedOn), whose result is checked. addTask's
// own plannedOn writes the focus row best-effort and returns the id even when
// that write failed (and skips it on a duplicate-id retry), so it is never
// used for this — a failed today choice is reported and retried by itself,
// without writing the task twice.
//
// Order: new goals, season, month, the week, then today's choices. Every row
// carries a pre-generated id, so a retry skips rows already saved and a row
// whose response was lost is found again (addTask/addGoal read it back). A
// row whose parent failed in this attempt waits, and the result says so.

import { activeGoals, sourceCandidates, type DraftPeriods, type ExistingPlan, type Horizon, type PlanDomain, type VoicePlanDraft } from './flow'

export type SaveLevel = Horizon

export interface PlanRow {
  id: string
  level: SaveLevel
  title: string
  /** The year goal this row serves (goals.id) — written as tasks.goal_id. */
  goalId?: string
  /** The line one level up it is written for (tasks.source_id): a month
   *  line's Fall line, a week task's month line. */
  sourceId?: string
  /** level 'today': the week task (new or existing) chosen for today. */
  existingId?: string
  /** Waits for this row (a new task's today choice waits for the task). */
  after?: string
  context: PlanDomain
}

export interface VoicePlanWriters {
  /** A new goal for the session's year. Resolves true when stored. */
  addYearGoal: (title: string, o: { id: string; context: PlanDomain; periods: DraftPeriods }) => Promise<boolean>
  /** New season, month and week lines, as tasks, in the session's periods. Resolves true when stored. */
  addTask: (title: string, o: { id: string; level: 'season' | 'month' | 'week'; goalId?: string; sourceId?: string; context: PlanDomain; periods: DraftPeriods }) => Promise<boolean>
  /** Choose a week task for the session's today, on its own row. Resolves true only when the choice is stored. */
  planForToday: (taskId: string, periods: DraftPeriods) => Promise<boolean>
}

export type FailReason = 'write_failed' | 'parent_not_saved'
export interface SaveResult {
  ok: boolean
  /** Every row id stored so far, this attempt and earlier ones. */
  saved: string[]
  failed: { id: string; level: SaveLevel; title: string; reason: FailReason }[]
}

/** The rows a session becomes, parents before children. Only what is new. */
export function planRows(d: VoicePlanDraft, existing: ExistingPlan): PlanRow[] {
  const inSession = new Map(activeGoals(d).map((g) => [g.id, g]))
  // A line lives in its goal's domain — read from the rows the person can see
  // now, not from a stale draft; new goals and unlinked lines take the one
  // chosen on Review.
  const current = new Map(existing.goals.map((g) => [g.id, g.context ?? null]))
  const contextFor = (goalId: string | null): PlanDomain => (goalId ? current.get(goalId) : null) || d.domain
  const keep = (goalId: string | null) => goalId === null || inSession.has(goalId)
  // A chosen line above counts only while it is still a real candidate.
  const valid = (level: 'month' | 'week', goalId: string | null, id: string | null | undefined) =>
    id && sourceCandidates(d, existing, level, goalId).some((c) => c.id === id) ? id : undefined
  const rows: PlanRow[] = []
  for (const g of activeGoals(d)) if (!g.existing) rows.push({ id: g.id, level: 'year', title: g.title, context: d.domain })
  for (const l of d.season) {
    if (!keep(l.goalId)) continue
    rows.push({ id: l.id, level: 'season', title: l.text, ...(l.goalId ? { goalId: l.goalId } : {}), context: contextFor(l.goalId) })
  }
  for (const l of d.month) {
    if (!keep(l.goalId)) continue
    const source = valid('month', l.goalId, l.sourceId)
    rows.push({ id: l.id, level: 'month', title: l.text, ...(l.goalId ? { goalId: l.goalId } : {}), ...(source ? { sourceId: source } : {}), context: contextFor(l.goalId) })
  }
  for (const w of d.week) {
    if (!keep(w.goalId)) continue
    const source = valid('week', w.goalId, w.sourceId)
    rows.push({ id: w.id, level: 'week', title: w.text, context: contextFor(w.goalId), ...(w.goalId ? { goalId: w.goalId } : {}), ...(source ? { sourceId: source } : {}) })
  }
  for (const id of d.today) {
    const fresh = d.week.find((w) => w.id === id && keep(w.goalId))
    const item = existing.items.find((i) => i.id === id && i.horizon === 'week')
    if (fresh) rows.push({ id: `today:${id}`, level: 'today', title: fresh.text, existingId: id, after: id, context: contextFor(fresh.goalId) })
    else if (item && !item.today) rows.push({ id: `today:${id}`, level: 'today', title: item.title, existingId: id, context: item.context ?? d.domain })
  }
  return rows
}

async function wrote(f: () => Promise<boolean>): Promise<boolean> {
  try { return (await f()) === true } catch { return false }
}

/** Write rows in order, skipping those already saved, holding back any whose parent failed. */
export async function saveRows(
  rows: PlanRow[],
  w: VoicePlanWriters,
  alreadySaved: readonly string[],
  periods: DraftPeriods,
  onSaved?: (id: string) => void,
): Promise<SaveResult> {
  const saved = new Set(alreadySaved)
  const failed: SaveResult['failed'] = []
  const missing = new Set<string>()
  for (const row of rows) {
    if (saved.has(row.id)) continue
    const parents = [row.goalId, row.sourceId, row.after].filter((p): p is string => !!p)
    if (parents.some((p) => missing.has(p))) {
      missing.add(row.id)
      failed.push({ id: row.id, level: row.level, title: row.title, reason: 'parent_not_saved' })
      continue
    }
    const ok = row.level === 'year'
      ? await wrote(() => w.addYearGoal(row.title, { id: row.id, context: row.context, periods }))
      : row.level === 'today'
        ? await wrote(() => w.planForToday(row.existingId!, periods))
        : await wrote(() => w.addTask(row.title, {
            id: row.id, level: row.level as 'season' | 'month' | 'week', goalId: row.goalId, sourceId: row.sourceId, context: row.context, periods,
          }))
    if (ok) {
      saved.add(row.id)
      onSaved?.(row.id)
    } else {
      missing.add(row.id)
      failed.push({ id: row.id, level: row.level, title: row.title, reason: 'write_failed' })
    }
  }
  return { ok: failed.length === 0, saved: [...saved], failed }
}

export function saveVoicePlan(d: VoicePlanDraft, existing: ExistingPlan, w: VoicePlanWriters, onSaved?: (id: string) => void): Promise<SaveResult> {
  return saveRows(planRows(d, existing), w, d.saved, d.periods, onSaved)
}
