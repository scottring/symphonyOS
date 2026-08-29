// src/lib/today/domainFilter.ts
//
// Domain scoping for planning (guided sessions + horizon pages). One rule,
// one place: Universal is the whole-life view and matches everything; a
// domain matches only its exact context — untagged (null-context) items live
// at the whole-life level and are reviewable only in Universal. The single
// exception is the pre-triage inbox, where tagging IS the work (see
// filterTasksForPlanning).
import type { Task, TaskContext } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { resolveEventContext } from './eventContext'
import { isEventVisibleToFamily } from './eventVisibility'
import { layerOf, type Layer } from '@/lib/domains'

/** Mirrors useDomain's Domain, kept here so pure lib code and tests don't
 *  import from a hook module. */
export type PlanningDomain = TaskContext | 'universal'

export const DOMAIN_LABELS: Record<Exclude<PlanningDomain, 'universal'>, string> = {
  work: 'Work',
  family: 'Family',
  personal: 'Personal',
}

export function matchesDomain(
  context: TaskContext | null | undefined,
  domain: PlanningDomain,
): boolean {
  return domain === 'universal' || context === domain
}

/** The guided-session task pool. Domain sessions additionally see UNTAGGED
 *  inbox items: the inbox is pre-triage, and hiding untagged captures would
 *  make inbox-zero unreachable from a domain session. (The container stamps
 *  the session's domain onto an untagged item when it gets triaged, so it
 *  lands on a list the session can still see.) */
export function filterTasksForPlanning(tasks: Task[], domain: PlanningDomain): Task[] {
  if (domain === 'universal') return tasks
  return tasks.filter((t) => t.context === domain || (!t.context && t.bucket === 'inbox'))
}

/** The Today/day-view task pool. Differs from filterTasksForPlanning in one
 *  way: UNTAGGED tasks stay visible in every domain (they get a tag nudge
 *  rather than disappearing).
 *
 *  **This filters by life area and NOTHING else — never by who owns or is
 *  assigned an item.** It used to drop any work/personal task whose assignees
 *  did not include you, as a privacy guard. That guard was both redundant and
 *  wrong. Redundant because RLS is the real gate and it holds:
 *  `scope IN ('couple','compound') AND users_share_household(...)`
 *  (2026-06-07_scope_axis.sql:34) means another user's private row never
 *  reaches the client to be filtered. Wrong because it keys on ASSIGNEE, not
 *  owner — a task YOU own, tagged personal, handed to your partner failed the
 *  check and vanished from your own view; and a `couple`-scoped personal item
 *  someone deliberately shared with you stayed hidden unless they also
 *  assigned it to you.
 *
 *  `context` answers what part of life. `scope` answers who can see it. They
 *  are separate columns and this function only reads the first. Narrowing to a
 *  person is the assignee filter's job, and it is opt-in. */
export function filterTasksForDomainView(
  tasks: Task[],
  domain: PlanningDomain,
): Task[] {
  if (domain === 'universal') return tasks
  return tasks.filter((task) => task.context === domain || task.context == null)
}

/** Resolution inputs for event domain filtering. All optional — a caller that
 *  only has the calendar→domain mapping still gets correct calendar-level
 *  scoping; overrides and family-share notes refine it where available. */
export interface EventDomainDeps {
  /** Manual per-event context overrides (from event notes) — beat the mapping. */
  eventContextOverrides?: Map<string, TaskContext>
  /** calendar_id/name → domain mapping (useCalendarDomainMappings). */
  getDomainForCalendar?: (calendarId?: string, calendarName?: string) => TaskContext | null
  /** Family domain also shows private events explicitly shared with family. */
  eventNotesMap?: ReadonlyMap<string, { sharedWithFamily?: boolean }>
}

/** Domain-scope calendar events the same way HomeView scopes Today: a specific
 *  domain shows its own events PLUS untagged ones (calendars with no domain
 *  mapping stay visible everywhere until mapped); Universal shows all; Family
 *  additionally shows private events explicitly shared with family. */
export function filterEventsForDomain(
  events: CalendarEvent[],
  domain: PlanningDomain,
  deps: EventDomainDeps = {},
): CalendarEvent[] {
  if (domain === 'universal') return events
  return events.filter((event) => {
    const resolved = resolveEventContext(event, deps.eventContextOverrides, deps.getDomainForCalendar)
    if (domain === 'family') {
      const note = deps.eventNotesMap?.get(event.google_event_id || event.id)
      return isEventVisibleToFamily(resolved, !!note?.sharedWithFamily)
    }
    return resolved === domain || resolved == null
  })
}

/** Domain-scope routines: exact context match only — untagged routines live at
 *  the whole-life level and show only in Universal (mirrors HomeView). */
export function filterRoutinesForDomain<T extends { context?: TaskContext | null }>(
  routines: T[],
  domain: PlanningDomain,
): T[] {
  if (domain === 'universal') return routines
  return routines.filter((r) => r.context === domain)
}

/** planning_sessions period token for a domain session. Universal keeps the
 *  bare token, so every pre-existing row remains the universal session. */
export function domainSessionToken(baseToken: string, domain: PlanningDomain): string {
  return domain === 'universal' ? baseToken : `${baseToken}|${domain}`
}

// ---------------------------------------------------------------------------
// Layer-set filtering (new model). A layer set is a checklist of layers
// (work/family/personal/unsorted) rather than a single selected domain — an
// item shows iff the layer its context maps to is checked. `context IS NULL`
// is the Unsorted layer, a real layer, not "everywhere" the way `universal`
// was above. These live alongside the domain-based helpers above; a later
// task deletes the old ones once every caller has migrated.

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
