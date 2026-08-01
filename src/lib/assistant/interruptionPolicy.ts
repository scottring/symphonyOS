// The one gate for unprompted delivery. Pure: no DB, no clock of its own, no
// React. `now` and `state` are injected so the whole truth table is fixture-
// testable, including the boundaries — which is where this class of code breaks.

import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'
import { isActionableSuggestion } from './actionable'
import { resolveSuggestionAction, revealItemId } from './suggestionAction'
import { CRITICAL_URGENCY } from './urgency'
import { inInterruptionWindow } from './interruptionWindow'

/** Attention is ONE resource, so there is one budget — not a per-surface budget
 *  that sums to more than exists. Counted as distinct suggestions seen today. */
export const DAILY_INTERRUPT_BUDGET = 8

/** How long a seen-but-unacted suggestion stays quiet before it may reappear. */
export const SEEN_COOLDOWN_HOURS = 4

export type SurfaceId = 'wall' | 'today'

export interface SurfaceProfile {
  id: SurfaceId
  urgencyFloor: number
  /** How many may show at once on this surface. */
  concurrent: number
  respectsWindow: boolean
  /**
   * True when this surface's only fallback action is revealing the entity, so a
   * suggestion with nothing to reveal is a dead tap. Today reveals by selecting
   * a row in its own list, which exists only for tasks and calendar events.
   */
  requiresRevealTarget: boolean
}

/**
 * The asymmetry is deliberate. The wall speaks when you didn't ask — high floor,
 * one line, never a stack, and it honors the DND window. Today you opened on
 * purpose, so it gets a lower floor, may show three, and is exempt from the
 * window. Today still CONSUMES budget: attention spent is attention spent.
 */
export const SURFACES: Record<SurfaceId, SurfaceProfile> = {
  wall: { id: 'wall', urgencyFloor: 70, concurrent: 1, respectsWindow: true, requiresRevealTarget: false },
  today: { id: 'today', urgencyFloor: 55, concurrent: 3, respectsWindow: false, requiresRevealTarget: true },
}

export type RejectReason =
  | 'not_actionable'
  | 'no_reveal_target'
  | 'not_active'
  | 'snoozed'
  | 'below_floor'
  | 'outside_window'
  | 'budget_spent'
  | 'cooldown'

export interface InterruptState {
  /** Distinct suggestions already seen today, across all surfaces. */
  budgetSpent: number
}

export type InterruptDecision =
  | { allow: true; urgency: number; critical: boolean; reason: 'allowed' }
  | { allow: false; reason: RejectReason }

/**
 * Check order is FIXED so a rejection reason is always the most specific true
 * one — that is what makes `?why=1` useful rather than misleading.
 */
export function mayInterrupt(
  s: ProactiveSuggestion,
  urgency: number,
  surface: SurfaceProfile,
  state: InterruptState,
  now: Date,
): InterruptDecision {
  // These two are never bypassable, not even by critical: a dead chip is a dead
  // tap, and an already-handled suggestion must not resurface.
  if (!isActionableSuggestion(s)) return { allow: false, reason: 'not_actionable' }
  // Same rule, one step more specific: the action resolves, but this surface can
  // only honour it by revealing an entity it has no row for. Rejecting here — in
  // the policy, ahead of the concurrent-slice — is what stops a dead row from
  // shadowing a live one.
  if (
    surface.requiresRevealTarget &&
    resolveSuggestionAction(s).kind === 'reveal' &&
    !revealItemId(s)
  ) {
    return { allow: false, reason: 'no_reveal_target' }
  }
  if (s.status !== 'active') return { allow: false, reason: 'not_active' }

  if (s.snoozedUntil && new Date(s.snoozedUntil).getTime() > now.getTime()) {
    return { allow: false, reason: 'snoozed' }
  }

  if (urgency < surface.urgencyFloor) return { allow: false, reason: 'below_floor' }

  // Reachable only by "a timed event starts within 90 minutes". One named
  // constant, one entry condition, so it can't quietly become the common path.
  const critical = urgency >= CRITICAL_URGENCY

  if (!critical) {
    if (surface.respectsWindow && !inInterruptionWindow(now)) {
      return { allow: false, reason: 'outside_window' }
    }
    if (state.budgetSpent >= DAILY_INTERRUPT_BUDGET) {
      return { allow: false, reason: 'budget_spent' }
    }
    if (s.seenAt) {
      const hoursSinceSeen = (now.getTime() - new Date(s.seenAt).getTime()) / 3_600_000
      // Escalation beats cooldown: this is the payoff for recording seen_urgency —
      // the system can tell "you ignored this" from "you saw a calmer version".
      const escalated = urgency > (s.seenUrgency ?? 0)
      if (hoursSinceSeen < SEEN_COOLDOWN_HOURS && !escalated) {
        return { allow: false, reason: 'cooldown' }
      }
    }
  }

  return { allow: true, urgency, critical, reason: 'allowed' }
}
