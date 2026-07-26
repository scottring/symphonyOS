import type { TimelineItem } from '@/types/timeline'

/**
 * Finding duplicates on Today: prep tasks regenerated from templates, the
 * Reminders bridge, meal upserts, the same errand captured twice on two
 * surfaces. They inflate the row count with things that are not real work.
 *
 * EXACT normalized matches only. Fuzzy matching is excluded deliberately — the
 * resolution this feeds deletes, and a false positive deletes real work.
 */

/** Lowercase, strip punctuation and emoji, collapse whitespace. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}]/gu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** How much context a copy carries. The richer one is almost always the real one. */
export function contextScore(item: TimelineItem): number {
  let score = 0
  if (item.notes) score += 1
  if (item.projectId) score += 1
  if (item.links?.length) score += 1
  if (item.phoneNumber) score += 1
  if (item.contactId) score += 1
  if (item.location) score += 1
  return score
}

export interface DuplicatePair {
  key: string
  items: TimelineItem[]
  /** Pre-selected keeper: the copy carrying the most context. */
  keeper: TimelineItem
  /** True when the group spans types (e.g. task + routine). NEVER offer delete. */
  crossType: boolean
}

/** `task-abc` → `abc`, so a child's parentTaskId can be compared to a wrapper. */
function rawId(timelineId: string): string {
  const dash = timelineId.indexOf('-')
  return dash === -1 ? timelineId : timelineId.slice(dash + 1)
}

/**
 * A group wrapper is named after the card it was built from (Stage 2b's
 * card-onto-card gesture), so a wrapper and its own child legitimately share a
 * title. Pairing them would offer to delete half of a group the user just
 * built.
 */
function isParentChildPair(group: TimelineItem[]): boolean {
  const ids = new Set(group.map((i) => rawId(i.id)))
  return group.some((i) => i.isSubtask && i.parentTaskId && ids.has(i.parentTaskId))
}

export function findDuplicates(items: TimelineItem[]): DuplicatePair[] {
  const byKey = new Map<string, TimelineItem[]>()
  for (const item of items) {
    if (item.completed) continue // history, not clutter
    const key = normalizeTitle(item.title)
    if (!key) continue // an emoji- or punctuation-only title would match everything
    const arr = byKey.get(key) ?? []
    arr.push(item)
    byKey.set(key, arr)
  }

  const pairs: DuplicatePair[] = []
  for (const [key, group] of byKey) {
    if (group.length < 2) continue
    if (isParentChildPair(group)) continue
    const keeper = [...group].sort((a, b) => contextScore(b) - contextScore(a))[0]
    const crossType = new Set(group.map((i) => i.type)).size > 1
    pairs.push({ key, items: group, keeper, crossType })
  }
  return pairs
}
