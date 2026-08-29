// src/lib/today/domainFilter.ts
//
// Layer-set filtering for the whole app (Today/Week/Month, planning, horizon
// pages). One rule, one place: a layer set is a checklist of layers
// (work/family/personal/unsorted) — an item shows iff the layer its context
// maps to is checked. `context IS NULL` is the Unsorted layer, a real layer,
// not "everywhere" the way the old single-domain model's `universal` was.
import type { Task, TaskContext } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { resolveEventContext } from './eventContext'
import { layerOf, type Layer, type DomainId } from '@/lib/domains'

/** Resolution inputs for event layer filtering. All optional — a caller that
 *  only has the calendar→domain mapping still gets correct calendar-level
 *  scoping; overrides and family-share notes refine it where available. */
export interface EventDomainDeps {
  /** Manual per-event context overrides (from event notes) — beat the mapping. */
  eventContextOverrides?: Map<string, TaskContext>
  /** calendar_id/name → domain mapping (useCalendarDomainMappings). */
  getDomainForCalendar?: (calendarId?: string, calendarName?: string) => TaskContext | null
  /** Family layer also shows private events explicitly shared with family. */
  eventNotesMap?: ReadonlyMap<string, { sharedWithFamily?: boolean }>
}

/** planning_sessions period token for a session. A sole domain gets its own
 *  session; the bare token is the whole-life session, so every pre-existing
 *  row keeps working. */
export function domainSessionToken(baseToken: string, domain: DomainId | null): string {
  return domain ? `${baseToken}|${domain}` : baseToken
}

/** Layer-set rule: an item shows iff the layer its context maps to is checked.
 *  `context IS NULL` is the Unsorted layer — a real layer, not "everywhere". */
export function matchesLayers(context: TaskContext | null | undefined, layers: ReadonlySet<Layer>): boolean {
  return layers.has(layerOf(context))
}

export function filterByLayers<T extends { context?: TaskContext | null }>(items: T[], layers: ReadonlySet<Layer>): T[] {
  return items.filter((i) => matchesLayers(i.context, layers))
}

export function filterTasksForLayers(tasks: Task[], layers: ReadonlySet<Layer>): Task[] {
  return filterByLayers(tasks, layers)
}

export function filterRoutinesForLayers<T extends { context?: TaskContext | null }>(routines: T[], layers: ReadonlySet<Layer>): T[] {
  return filterByLayers(routines, layers)
}

/** Events: override → calendar mapping → Unsorted. An unmapped calendar used to
 *  leak into every domain; now it sits in Unsorted, which is the nudge to map it.
 *  Family additionally shows a private event explicitly shared with family. */
export function filterEventsForLayers(events: CalendarEvent[], layers: ReadonlySet<Layer>, deps: EventDomainDeps = {}): CalendarEvent[] {
  return events.filter((event) => {
    const resolved = resolveEventContext(event, deps.eventContextOverrides, deps.getDomainForCalendar)
    if (matchesLayers(resolved, layers)) return true
    if (layers.has('family')) {
      const note = deps.eventNotesMap?.get(event.google_event_id || event.id)
      return !!note?.sharedWithFamily
    }
    return false
  })
}
