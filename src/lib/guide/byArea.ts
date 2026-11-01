// Group a list's lines by life area for the Month, Season and Year pages.
// Only areas the viewer can see (useLifeAreas) head a group; a line whose
// area is not among them, or has none, goes under "No area" (area: null).
// With no areas at all the list is one ungrouped group, drawn as today.

import type { LifeArea } from '@/hooks/useLifeAreas'

export interface AreaGroup<T> { area: LifeArea | null; items: T[] }

export function groupByArea<T extends { areaId?: string | null }>(items: T[], areas: LifeArea[]): AreaGroup<T>[] {
  if (areas.length === 0) return items.length ? [{ area: null, items }] : []
  const ordered = [...areas].sort((a, b) => a.sortOrder - b.sortOrder)
  const known = new Set(ordered.map((a) => a.id))
  const groups: AreaGroup<T>[] = ordered
    .map((area) => ({ area: area as LifeArea | null, items: items.filter((i) => i.areaId === area.id) }))
    .filter((g) => g.items.length > 0)
  const none = items.filter((i) => !i.areaId || !known.has(i.areaId))
  if (none.length) groups.push({ area: null, items: none })
  return groups
}
