// src/lib/planning/journalGroups.ts
//
// Open journal (Scott chose it, 2026-10-08): on a planning page, each line of
// the period above stands beside the entries written for it — October beside
// each Fall milestone, the week's actions beside each October priority —
// with everything else in one general section. Pure: no fetching, no writes.
//
// Which line an entry is "for" is read from the links rows already carry,
// never a new one:
//  - a week item → its month line: source_id, else goal_task_id — exactly
//    what linkedLine (the "↳ for October" annotation) reads.
//  - a month line → its season line: source_id (written for / copied down),
//    else supports_goal_task_id (a v1 month goal backing a season goal), else
//    goal_task_id. goal_id is the YEAR goal and never a season parent.
// New links are written to source_id only: goal_task_id means "is a step of",
// and steps are carried along when their goal moves.
//
// Privacy: `parents` are the caller's visible reference rows. An entry whose
// parent is not among them goes to the general section, and no group, title or
// count is made for a parent the reader cannot see.

import type { Task } from '@/types/task'

export type LinkField = 'sourceId' | 'supportsGoalTaskId' | 'goalTaskId'

export interface LinkRule {
  fields: LinkField[]
  /** 'first-set': the first field with a value decides, as linkedLine does
   *  (the week). 'first-visible': the first field naming a visible parent. */
  mode: 'first-set' | 'first-visible'
}

export const WEEK_TO_MONTH: LinkRule = { fields: ['sourceId', 'goalTaskId'], mode: 'first-set' }
export const MONTH_TO_SEASON: LinkRule = { fields: ['sourceId', 'supportsGoalTaskId', 'goalTaskId'], mode: 'first-visible' }

type Linkable = Pick<Task, 'id'> & Partial<Pick<Task, LinkField>>

/** The visible parent an entry is for, and the field that says so. */
export function parentOf(t: Linkable, rule: LinkRule, visible: ReadonlySet<string>): { id: string; field: LinkField } | null {
  for (const field of rule.fields) {
    const id = t[field]
    if (!id || id === t.id) continue
    if (visible.has(id)) return { id, field }
    if (rule.mode === 'first-set') return null
  }
  return null
}

/** True when the entry names a parent the reader can't see here (another
 *  person's, another period's). Says nothing about which. */
export function hasUnseenParent(t: Linkable, rule: LinkRule, visible: ReadonlySet<string>): boolean {
  return !parentOf(t, rule, visible) && rule.fields.some((f) => { const id = t[f]; return !!id && id !== t.id && !visible.has(id) })
}

export interface JournalGroup<P, E> {
  parent: P
  entries: E[]
  /** The parent line ITSELF is also committed to this period ("Into this
   *  week" keeps one row with two commitments): it is one of the entries, and
   *  the page says so rather than drop it (2026-10-08 review). */
  itself: boolean
}

/** Every visible parent, in its order, with its entries; the rest in `general`. */
export function groupByParent<P extends { id: string }, E extends Linkable>(
  parents: readonly P[], entries: readonly E[], rule: LinkRule,
): { groups: JournalGroup<P, E>[]; general: E[] } {
  const visible = new Set(parents.map((p) => p.id))
  const by = new Map<string, E[]>(parents.map((p) => [p.id, []]))
  const general: E[] = []
  const itself = new Set<string>()
  for (const e of entries) {
    // The same row on both lists: it stands in its own section, as itself.
    // (It is never its own parent — parentOf skips a link to itself.)
    if (visible.has(e.id)) { by.get(e.id)!.push(e); itself.add(e.id); continue }
    const p = parentOf(e, rule, visible)
    if (p) by.get(p.id)!.push(e)
    else general.push(e)
  }
  return { groups: parents.map((p) => ({ parent: p, entries: by.get(p.id)!, itself: itself.has(p.id) })), general }
}

/**
 * Set, change or remove which line an entry is for, on the same row. Set
 * writes source_id. Remove clears the field that is SHOWN (and any other
 * field naming that same line, so it really goes); a different line still
 * named by another field is kept and returned as `revealed`.
 */
export function relinkUpdates(t: Linkable, lineId: string | null, rule: LinkRule, visible: ReadonlySet<string>): { updates: Partial<Pick<Task, LinkField>>; revealed: string | null } {
  if (lineId) return { updates: { sourceId: lineId }, revealed: null }
  const shown = parentOf(t, rule, visible)
  if (!shown) return { updates: {}, revealed: null }
  const updates: Partial<Pick<Task, LinkField>> = {}
  for (const f of rule.fields) if (t[f] === shown.id) updates[f] = undefined
  const after = { ...t, ...updates }
  return { updates, revealed: parentOf(after, rule, visible)?.id ?? null }
}

/** "2 Fall milestones have no October lines yet." — for the footer; null when all have some. */
export function untouchedCount<P, E>(groups: readonly JournalGroup<P, E>[], open: (e: E) => boolean): number {
  return groups.filter((g) => !g.entries.some(open)).length
}
