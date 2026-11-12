// "Which routines must not slip?" (Scott, 2026-11-12: "it seems like this is
// something AI should be involved in"). The page finds the routines that come
// round rarely enough for a miss to go unnoticed — monthly or less often, or
// every other week and longer — and are not yet kept until done; Symphony
// judges which of them matter (a bill, a renewal) and proposes the switch on
// one change card. Nothing changes until it is approved.

import type { Routine } from '@/types/routine'
import { namesDueDays, routineSwitches } from '@/lib/routineUtils'

export function isInfrequent(r: Routine): boolean {
  const p = r.recurrence_pattern
  switch (p?.type) {
    case 'monthly': case 'quarterly': case 'yearly': case 'specific_days': return true
    case 'weekly': return (p.interval ?? 1) >= 2
    default: return false
  }
}

/** Running routines of their own, with set days, rare, and not yet kept. */
export function keepCandidates(routines: readonly Routine[]): Routine[] {
  return routines.filter((r) => !r.keep_until_done && routineSwitches(r).active && !r.parent_routine_id
    && namesDueDays(r.recurrence_pattern) && isInfrequent(r))
}

/** Seen-key: the offer comes back only when a new candidate appears. */
export function offerKey(candidates: readonly Routine[]): string {
  return candidates.map((r) => r.id).sort().join(',')
}

/** What the offer sends to Symphony. */
export function keepMessage(candidates: readonly Routine[]): string {
  const names = candidates.map((r) => `“${r.name}”`).join(', ')
  return `Which of our routines mustn't slip if we miss them? These come round monthly or less often and aren't kept until done: ${names}. `
    + 'Read them (symphony_list_routines), pick the ones where a miss would cost something — a payment, bill, renewal, registration, deadline or booking — '
    + 'and propose keep_until_done true for just those on one change card, a few words of why beside each. '
    + 'Name the ones you left off in one line. Change nothing else.'
}
