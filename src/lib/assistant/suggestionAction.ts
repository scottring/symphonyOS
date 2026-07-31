// What a suggestion's primary action IS, described rather than performed.
//
// ProactiveSuggestionChips.handleClick performs its actions inline (window.open
// with tel:/sms:/mailto:, plus React state for the outcome picker). That works
// and is shipped, so it is left alone. The unprompted tier needs the same
// decisions on two surfaces with different capabilities — the desktop/Today band
// can open URL schemes, the Pi kiosk mostly cannot — so it resolves the action to
// a DESCRIPTION first and lets each surface decide what it can honour.
//
// Follow-up worth doing later: point ProactiveSuggestionChips at this resolver
// too, so there is one switch instead of two. Not done here because that path is
// the anchored tier and is working.

import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

export type ResolvedAction =
  | { kind: 'call'; phoneNumber: string }
  | { kind: 'text'; phoneNumber: string; messageTemplate?: string }
  | { kind: 'email'; email: string; subject?: string }
  | { kind: 'open_link'; url: string }
  | { kind: 'navigate'; location: string; placeId?: string }
  | { kind: 'plan_session'; horizon: string }
  /** Nothing performable — the surface should just reveal the entity. */
  | { kind: 'reveal' }

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export function resolveSuggestionAction(s: ProactiveSuggestion): ResolvedAction {
  const p = s.actionPayload ?? {}
  const actionType = s.actionType || s.suggestionType

  switch (actionType) {
    case 'plan_session': {
      const horizon = str(p.planHorizon)
      return horizon ? { kind: 'plan_session', horizon } : { kind: 'reveal' }
    }
    case 'call': {
      const phoneNumber = str(p.phoneNumber)
      return phoneNumber ? { kind: 'call', phoneNumber } : { kind: 'reveal' }
    }
    case 'text': {
      const phoneNumber = str(p.phoneNumber)
      return phoneNumber
        ? { kind: 'text', phoneNumber, messageTemplate: str(p.messageTemplate) }
        : { kind: 'reveal' }
    }
    case 'email': {
      const email = str(p.email)
      return email ? { kind: 'email', email, subject: str(p.subject) } : { kind: 'reveal' }
    }
    case 'open_link': {
      const url = str(p.url)
      return url ? { kind: 'open_link', url } : { kind: 'reveal' }
    }
    case 'navigate': {
      const location = str(p.location)
      return location
        ? { kind: 'navigate', location, placeId: str(p.placeId) }
        : { kind: 'reveal' }
    }
    default:
      return { kind: 'reveal' }
  }
}

/**
 * The Today-list item id a `reveal` action should select, or null when the
 * suggestion points at something Today has no row for.
 *
 * Today's selection API (`onSelectItem`) is keyed by a PREFIXED composite id —
 * `task-<uuid>` / `event-<uuid>` — not by the bare entity uuid a suggestion
 * carries. Selection is an id match, not a lookup, so a bare uuid matches no row
 * and the panel silently never opens.
 */
export function revealItemId(s: ProactiveSuggestion): string | null {
  if (!s.entityId) return null
  switch (s.entityType) {
    case 'task':
      return `task-${s.entityId}`
    case 'calendar_event':
      return `event-${s.entityId}`
    default:
      // email_action / general have no Today row to reveal.
      return null
  }
}

/** A short verb for the action button. Never a sentence — these sit on one line. */
export function actionLabel(action: ResolvedAction): string {
  switch (action.kind) {
    case 'call': return 'Call'
    case 'text': return 'Text'
    case 'email': return 'Email'
    case 'open_link': return 'Open'
    case 'navigate': return 'Directions'
    case 'plan_session': return 'Plan'
    case 'reveal': return 'Show me'
  }
}
