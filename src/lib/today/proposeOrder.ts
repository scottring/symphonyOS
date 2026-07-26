import type { TimelineItem } from '@/types/timeline'

/**
 * The assistant's proposed order and grouping for Today (spec move #8).
 *
 * Deterministic and pure on purpose. The spec's own warning about this move is
 * that "an optimizer needs durations, fixed anchors and some notion of energy
 * or location to beat a guess" — and Today's untimed items mostly have none of
 * that. So this proposes ONLY where it has an actual signal, and every
 * suggestion carries the reason it was made. Where there is no signal it
 * returns nothing, which is the honest answer and reads as "no proposal"
 * rather than as a confident-sounding shuffle.
 *
 * Nothing here writes. It produces a proposal the user accepts, partially
 * accepts, or discards — the same rule as the duplicate sweep, and consistent
 * with the canonical "look, don't link" planning model.
 */

export interface GroupProposal {
  /** Stable key for accept/dismiss bookkeeping. */
  key: string
  name: string
  /** Timeline ids, in the order they should read inside the group. */
  itemIds: string[]
  /** Why this was proposed, shown verbatim to the user. */
  reason: string
}

export interface OrderProposal {
  /** Timeline ids in the proposed reading order. */
  itemIds: string[]
  reason: string
}

export interface Proposal {
  groups: GroupProposal[]
  /** Null when there is no signal worth reordering on. */
  order: OrderProposal | null
}

const MIN_GROUP = 2

/** Items already inside a group are left alone — the user built that. */
function isFree(item: TimelineItem): boolean {
  return !item.isSubtask && !item.parentTaskId
}

/**
 * Group by project. This is the one signal Today reliably has: a project is an
 * explicit statement that these things belong together.
 */
function proposeProjectGroups(
  items: TimelineItem[],
  projectName: (id: string) => string | undefined,
): GroupProposal[] {
  const byProject = new Map<string, TimelineItem[]>()
  for (const item of items) {
    if (!isFree(item) || !item.projectId) continue
    const arr = byProject.get(item.projectId) ?? []
    arr.push(item)
    byProject.set(item.projectId, arr)
  }

  const out: GroupProposal[] = []
  for (const [projectId, group] of byProject) {
    if (group.length < MIN_GROUP) continue
    const name = projectName(projectId)
    if (!name) continue
    out.push({
      key: `project:${projectId}`,
      name,
      itemIds: group.map((i) => i.id),
      reason: `${group.length} items already belong to ${name}.`,
    })
  }
  return out
}

/**
 * Group by shared location. Two errands at the same place are one trip, which
 * is the only "where" signal available without asking the user for one.
 */
function proposeLocationGroups(
  items: TimelineItem[],
  alreadyGrouped: Set<string>,
): GroupProposal[] {
  const byPlace = new Map<string, TimelineItem[]>()
  for (const item of items) {
    if (!isFree(item) || alreadyGrouped.has(item.id)) continue
    const place = item.location?.trim().toLowerCase()
    if (!place) continue
    const arr = byPlace.get(place) ?? []
    arr.push(item)
    byPlace.set(place, arr)
  }

  const out: GroupProposal[] = []
  for (const [place, group] of byPlace) {
    if (group.length < MIN_GROUP) continue
    const label = group[0].location!.trim()
    out.push({
      key: `location:${place}`,
      name: label,
      itemIds: group.map((i) => i.id),
      reason: `${group.length} items are all at ${label} — one trip.`,
    })
  }
  return out
}

/**
 * A proposed reading order for the untimed pile: grouped-together things
 * adjacent, everything else left where it was. Deliberately conservative —
 * reordering on no signal is exactly the "confident-sounding shuffle" the spec
 * warns about, so this only claims an order when grouping actually clusters
 * something.
 */
function proposeOrderFrom(items: TimelineItem[], groups: GroupProposal[]): OrderProposal | null {
  if (groups.length === 0) return null
  const clustered = new Set(groups.flatMap((g) => g.itemIds))
  const inGroups = groups.flatMap((g) => g.itemIds)
  const rest = items.filter((i) => !clustered.has(i.id)).map((i) => i.id)
  const itemIds = [...inGroups, ...rest]
  // An order identical to the current one is not a proposal.
  const unchanged = itemIds.every((id, i) => items[i]?.id === id)
  if (unchanged) return null
  return {
    itemIds,
    reason: 'Things that go together are moved next to each other; nothing else moves.',
  }
}

export function proposeOrderAndGrouping(
  items: TimelineItem[],
  projectName: (id: string) => string | undefined,
): Proposal {
  const live = items.filter((i) => !i.completed)
  const projectGroups = proposeProjectGroups(live, projectName)
  const claimed = new Set(projectGroups.flatMap((g) => g.itemIds))
  const groups = [...projectGroups, ...proposeLocationGroups(live, claimed)]
  return { groups, order: proposeOrderFrom(live, groups) }
}
