/**
 * Whether a proactive suggestion is still worth showing.
 *
 * proactive-engine stamps `expires_at = generated_at + 24h` on every row it
 * writes (proactive-engine/index.ts:912) — and until this existed, not one
 * client read that column back. All three consumers selected
 * `status = 'active'` and nothing else, so a suggestion about a meeting that
 * ended yesterday stayed "active" forever and kept competing for space.
 *
 * Both halves are needed and they catch different things:
 *  - the expiry catches rows the engine itself already called dead;
 *  - the entity check catches rows still inside their 24h window whose subject
 *    has nonetheless passed — a 3pm meeting is over by 9am the next morning,
 *    six hours before the row expires.
 */
import type { ProactiveSuggestion, SuggestionEntityType } from '@/types/proactiveSuggestion'

/**
 * PostgREST `.or()` argument keeping unexpired rows only. Applied in the query
 * so expired rows don't silently consume the `limit(50)` and starve live ones —
 * they sort by urgency, and a stale row's urgency is its peak, so they would
 * crowd the top of exactly that window.
 */
export function unexpiredFilter(now: Date = new Date()): string {
  return `expires_at.is.null,expires_at.gt.${now.toISOString()}`
}

/** Client-side twin of `unexpiredFilter` — the query is an optimisation, this
 *  is the guarantee. */
export function isSuggestionExpired(
  s: Pick<ProactiveSuggestion, 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  if (!s.expiresAt) return false
  return new Date(s.expiresAt).getTime() <= now.getTime()
}

/**
 * Entity types whose urgency is a function of a live clock (when is it due,
 * when does it start) rather than a standing property.
 *
 * Only these may be zeroed when a resolver comes back empty. `general` and
 * `email_action` are excluded deliberately: the Today resolver returns null for
 * them too — because it has no lookup for them, not because they're stale — and
 * treating that as "gone" would silently kill every email suggestion the moment
 * a surface supplied a resolver.
 */
const TIME_BOUND: readonly SuggestionEntityType[] = ['task', 'calendar_event']

export function isTimeBoundEntity(t: SuggestionEntityType): boolean {
  return TIME_BOUND.includes(t)
}
