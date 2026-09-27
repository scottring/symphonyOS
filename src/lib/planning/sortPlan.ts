// src/lib/planning/sortPlan.ts
//
// "Choose Fall's goals" — sorting an EXISTING plan into outcomes and actions
// (horizon flows correction, Scott, 2026-09-26: "this isn't really what we
// discussed, is it?"). A plan written on paper and imported arrives as a flat
// list: "Plan winter vacation" and "Nourish a love of reading" sit beside
// "Renew the passports" as equals, and the Season page showed an empty goals
// box above twenty-one of them. New-item defaults could not fix that.
//
// This module answers, for one period's list, which rows the reader may turn
// into goals in ONE reviewed step, which may not (and why), and what an Undo
// can safely put back. Nothing here writes, and nothing is ever chosen for the
// reader: the page shows the list, the reader picks, a preview says exactly
// what will change, and only then is `is_goal` flipped — on the SAME rows.
//
// What a conversion touches: `is_goal`, and nothing else. The id, notes,
// links, people, area and sharing, commitments and their history stay exactly
// as they were (goalConversion).

import type { Task } from '@/types/task'
import type { PlacementFate } from './lineage'
import { goalConversion } from './goalConversion'

export interface SortCandidate {
  task: Task
  /** Why it cannot become a goal here, or undefined when it can. */
  blocked?: string
}

/**
 * Every open, loose row on this period's list, eligible or not — in the
 * order the list draws them. A row the reader cannot convert is still shown,
 * with the reason, so the sort never makes work silently disappear from view.
 *
 * `fateOf` is the page's own reading of the row on THIS period ('open' = still
 * on this list, not yet planned lower). A row already planned into a month, a
 * week or a day is an action with a commitment below: making it a goal would
 * take a dated or weekly action off the lists it is on, so it is refused.
 */
export function sortCandidates(
  loose: readonly Task[],
  all: readonly Task[],
  fateOf: (t: Task) => PlacementFate,
): SortCandidate[] {
  return loose
    .filter((t) => !t.completed)
    .map((task) => {
      const fate = fateOf(task)
      if (fate !== 'open') {
        return {
          task,
          blocked: task.scheduledFor
            ? 'It already has a day, so it stays an action — a goal is never on a day.'
            : 'It is already planned into a narrower period, so it stays an action there.',
        }
      }
      const check = goalConversion(task, all)
      return check.ok ? { task } : { task, blocked: check.reason }
    })
}

/** What the preview says about the chosen rows, beyond their titles. */
export interface SortPreview {
  goals: Task[]
  /** Chosen rows with no life area: they stay private to their owner. */
  untagged: Task[]
  /** Rows that stay single actions. */
  staying: Task[]
}

export function sortPreview(candidates: readonly SortCandidate[], chosen: ReadonlySet<string>): SortPreview {
  const goals = candidates.filter((c) => !c.blocked && chosen.has(c.task.id)).map((c) => c.task)
  return {
    goals,
    untagged: goals.filter((t) => !t.context),
    staying: candidates.filter((c) => !goals.includes(c.task)).map((c) => c.task),
  }
}

/**
 * What an Undo of a sort may put back. A goal that has gained next actions
 * since is left a goal: turning it back into a task would strand its actions
 * under a row that is no longer a goal. Everything else returns to a single
 * action, the same row.
 */
export function sortUndo(batch: readonly string[], all: readonly Task[]): { revert: Task[]; kept: Array<{ task: Task; reason: string }> } {
  const revert: Task[] = []
  const kept: Array<{ task: Task; reason: string }> = []
  for (const id of batch) {
    const t = all.find((x) => x.id === id)
    if (!t || !t.isGoal) continue
    if (all.some((x) => x.goalTaskId === id)) {
      kept.push({ task: t, reason: 'It now holds next actions, so it stays a goal.' })
    } else revert.push(t)
  }
  return { revert, kept }
}

/** The last sort on a period, remembered so it can still be undone after the
 *  toast has gone — per browser, per period. Presentation state only: the
 *  rows themselves are the record. */
export interface SortBatch { ids: string[]; at: number }
const key = (level: string, periodYmd: string) => `symphony.plan.sortBatch.${level}.${periodYmd}`
export function readSortBatch(level: string, periodYmd: string): SortBatch | null {
  try {
    const raw = localStorage.getItem(key(level, periodYmd))
    const b = raw ? JSON.parse(raw) as SortBatch : null
    return b && Array.isArray(b.ids) ? b : null
  } catch { return null }
}
export function writeSortBatch(level: string, periodYmd: string, batch: SortBatch | null): void {
  try {
    if (batch) localStorage.setItem(key(level, periodYmd), JSON.stringify(batch))
    else localStorage.removeItem(key(level, periodYmd))
  } catch { /* storage unavailable: the Undo toast still works */ }
}
