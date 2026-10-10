// src/components/canvas/plan/planGroups.ts
//
// Plan, one horizon at a time: each item sits in a group headed by its parent
// one horizon up (a season's goals under each yearly intention, a month's
// milestones under each seasonal goal). Items with no visible parent form the
// Unlinked group, always last. At Year the intentions are the items.
// Pure: no fetching, no writes. Inputs are already filtered for privacy.

import type { PlanNode } from '@/components/plan/constellation/model'

export const UNLINKED = 'unlinked'
export const INTENTIONS = 'intentions'

export interface PlanGroup {
  /** The parent's node key, UNLINKED, or INTENTIONS at Year. */
  key: string
  kind: 'parent' | 'unlinked' | 'intentions'
  parent: PlanNode | null
  /** The grandparent's title, shown small above the group. */
  crumb: string | null
  /** Items shown (completed ones only when asked for). */
  items: PlanNode[]
}

export function isDone(n: PlanNode): boolean {
  return !!n.task?.completed || n.goal?.status === 'completed'
}

/** Open items one horizon below `node`. */
export function childCount(nodes: PlanNode[], node: PlanNode): number {
  return nodes.filter((n) => n.parent === node.key && !isDone(n)).length
}

export function horizonGroups(nodes: PlanNode[], level: number, showDone: boolean): { groups: PlanGroup[]; doneCount: number } {
  const here = nodes.filter((n) => n.level === level)
  const doneCount = here.filter(isDone).length
  const keep = (n: PlanNode) => showDone || !isDone(n)
  if (level === 0) {
    return { groups: [{ key: INTENTIONS, kind: 'intentions', parent: null, crumb: null, items: here.filter(keep) }], doneCount }
  }
  const groups: PlanGroup[] = []
  for (const parent of nodes.filter((n) => n.level === level - 1)) {
    const items = here.filter((n) => n.parent === parent.key && keep(n))
    // A finished parent stays as a header while it still holds open work.
    if (isDone(parent) && !showDone && items.length === 0) continue
    const grand = parent.parent ? nodes.find((n) => n.key === parent.parent) : undefined
    groups.push({ key: parent.key, kind: 'parent', parent, crumb: grand?.title ?? null, items })
  }
  groups.push({ key: UNLINKED, kind: 'unlinked', parent: null, crumb: null, items: here.filter((n) => !n.parent && keep(n)) })
  return { groups, doneCount }
}

/**
 * Which groups a `focus` key narrows the page to, or null for all of them.
 * A parent's key focuses its group; a grandparent's key focuses every group
 * under it; UNLINKED focuses the Unlinked group. An item's own key (a saved
 * item arriving from the conversation) does not narrow anything.
 */
export function focusedGroupKeys(groups: PlanGroup[], nodes: PlanNode[], level: number, focus: string | null): Set<string> | null {
  if (!focus) return null
  if (focus === UNLINKED) return groups.some((g) => g.key === UNLINKED) ? new Set([UNLINKED]) : null
  const node = nodes.find((n) => n.key === focus)
  if (!node) return null
  if (node.level === level - 1) return groups.some((g) => g.key === focus) ? new Set([focus]) : null
  if (node.level === level - 2) {
    const keys = groups.filter((g) => g.parent?.parent === focus).map((g) => g.key)
    return keys.length ? new Set(keys) : null
  }
  return null
}

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** "Oct 1 – 31", "Sep 1 – Nov 30", "Dec 1, 2026 – Feb 28, 2027". */
export function periodRange(start: Date, endExclusive: Date): string {
  const last = new Date(endExclusive); last.setDate(last.getDate() - 1)
  if (start.getFullYear() !== last.getFullYear()) return `${shortDate(start)}, ${start.getFullYear()} – ${shortDate(last)}, ${last.getFullYear()}`
  if (start.getMonth() === last.getMonth()) return `${shortDate(start)} – ${last.getDate()}`
  return `${shortDate(start)} – ${shortDate(last)}`
}
