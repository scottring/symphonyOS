// src/lib/filters/viewVisibility.ts
//
// "Would this item show under the current view?" — asked right after a save,
// so a new item the view hides is explained instead of vanishing (live,
// 2026-10-08: the top bar's people filter showed only Alex, an unassigned
// October line was added, the input cleared, and nothing appeared).
//
// Built from the two canonical filters so it cannot drift from what renders:
//   - the area (layer) rule, `matchesLayers` (lib/today/domainFilter), and
//   - the people rule, `makeAssigneeFilter` (lib/today/assigneeFilter), the
//     matcher Today, the week, the month, the season and the year all use
//     (planPeopleLens.keep is the same call).
//
// Widening is a VIEW change only: the people lens goes back to everyone, or
// the item's area is added to the checked layers. It never touches the item
// — not its assignees, its area, or who may read it. A filter only ever
// narrows what the signed-in user may already see.

import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { matchesLayers } from '@/lib/today/domainFilter'
import { ALL_LAYERS, DOMAINS, LAYER_LABELS, UNSORTED, layerOf, type Layer } from '@/lib/domains'
import type { TaskContext } from '@/types/task'

/** The two view lenses: the checked areas, and the people filter (empty = everyone). */
export interface ViewFilters {
  layers: ReadonlySet<Layer>
  people: readonly string[]
}

/** What a filter reads off an item: its area and its people. */
export interface ItemFacts {
  context?: TaskContext | null
  assignedTo?: string | null
  assignedToAll?: readonly string[] | null
}

/** Which lens hides the item. */
export interface HiddenBy {
  people: boolean
  area: boolean
}

interface Named { id: string; name: string }

/** null when the item shows under `view`; otherwise which lens hides it. */
export function hiddenBy(item: ItemFacts, view: ViewFilters): HiddenBy | null {
  const area = !matchesLayers(item.context, view.layers)
  const people = !makeAssigneeFilter([...view.people])(item.assignedTo, item.assignedToAll)
  return area || people ? { area, people } : null
}

/** The view that shows the item: only the lens that hid it is widened. */
export function widenedView(item: ItemFacts, view: ViewFilters, hidden: HiddenBy): ViewFilters {
  return {
    people: hidden.people ? [] : [...view.people],
    layers: hidden.area ? new Set<Layer>([...view.layers, layerOf(item.context)]) : view.layers,
  }
}

const listOf = (parts: string[]) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

/** "Alex’s items", "Alex’s and Mia’s items", "unassigned items". */
export function peoplePhrase(ids: readonly string[], members: readonly Named[]): string {
  const named = ids.filter((id) => id !== 'unassigned').map((id) => `${members.find((m) => m.id === id)?.name ?? 'one person'}’s`)
  if (ids.includes('unassigned')) named.push('unassigned')
  return `${listOf(named)} items`
}

/** "Family and Personal" — the checked areas, in the app's order. */
export function areaPhrase(layers: ReadonlySet<Layer>): string {
  const order: Layer[] = [...DOMAINS.map((d) => d.id), UNSORTED]
  return listOf(order.filter((l) => layers.has(l)).map((l) => LAYER_LABELS[l]))
}

/** "It’s hidden because you’re showing only Alex’s items." */
export function hiddenSentence(item: ItemFacts, view: ViewFilters, hidden: HiddenBy, members: readonly Named[]): string {
  const reasons: string[] = []
  if (hidden.people) reasons.push(`you’re showing only ${peoplePhrase(view.people, members)}`)
  if (hidden.area) reasons.push(`${LAYER_LABELS[layerOf(item.context)]} items aren’t shown`)
  return `It’s hidden because ${reasons.join(', and ')}.`
}

/** The plain-language line for a narrowed view, or null when nothing is
 *  narrowed: "Showing only Alex’s items in Family". */
export function viewSummary(view: ViewFilters, members: readonly Named[]): { text: string; people: boolean; area: boolean } | null {
  const people = view.people.length > 0
  const area = view.layers.size < ALL_LAYERS.size
  if (!people && !area) return null
  const text = people && area
    ? `Showing only ${peoplePhrase(view.people, members)} in ${areaPhrase(view.layers)}`
    : people ? `Showing only ${peoplePhrase(view.people, members)}` : `Showing only ${areaPhrase(view.layers)}`
  return { text, people, area }
}
