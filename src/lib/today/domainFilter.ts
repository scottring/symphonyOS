// src/lib/today/domainFilter.ts
//
// Domain scoping for planning (guided sessions + horizon pages). One rule,
// one place: Universal is the whole-life view and matches everything; a
// domain matches only its exact context — untagged (null-context) items live
// at the whole-life level and are reviewable only in Universal. The single
// exception is the pre-triage inbox, where tagging IS the work (see
// filterTasksForPlanning).
import type { Task, TaskContext } from '@/types/task'

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

/** planning_sessions period token for a domain session. Universal keeps the
 *  bare token, so every pre-existing row remains the universal session. */
export function domainSessionToken(baseToken: string, domain: PlanningDomain): string {
  return domain === 'universal' ? baseToken : `${baseToken}|${domain}`
}
