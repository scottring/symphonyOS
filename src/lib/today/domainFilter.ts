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

/** The Today/day-view task pool — the rule HomeView has always used, lifted
 *  here so every surface that shows "the day" scopes identically. Differs from
 *  filterTasksForPlanning in two ways: UNTAGGED tasks stay visible in every
 *  domain (they get a tag nudge rather than disappearing), and another
 *  member's work/personal tasks are hidden as private in ALL domains. */
export function filterTasksForDomainView(
  tasks: Task[],
  domain: PlanningDomain,
  currentUserMemberId?: string,
): Task[] {
  return tasks.filter((task) => {
    if (currentUserMemberId && (task.context === 'work' || task.context === 'personal')) {
      const assignees = task.assignedToAll && task.assignedToAll.length > 0
        ? task.assignedToAll
        : (task.assignedTo ? [task.assignedTo] : [])
      if (assignees.length > 0 && !assignees.includes(currentUserMemberId)) return false
    }
    if (domain === 'universal') return true
    return task.context === domain || task.context == null
  })
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
