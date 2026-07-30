import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

/**
 * A suggestion's chip is only worth rendering if its click handler actually
 * does something. `someday`/`stale`/`guided_chat` are no-ops in
 * ProactiveSuggestionChips.handleClick when the corresponding optional prop
 * (onPush/onDelete/onOpenGuidedChat) is absent — callers must filter those
 * out themselves before rendering (and before any top-N slice, so a dead
 * suggestion can't shadow a live one).
 *
 * Canonical home is here rather than in ProactiveSuggestionChips.tsx because
 * lib/assistant/interruptionPolicy.ts needs it and a pure policy module must
 * not import from a React component.
 */
export function isActionableSuggestion(
  s: ProactiveSuggestion,
  opts: { hasPush?: boolean; hasDelete?: boolean; hasGuidedChat?: boolean } = {}
): boolean {
  const actionType = s.actionType || s.suggestionType
  if (actionType === 'someday') return !!opts.hasPush
  if (actionType === 'stale') return !!opts.hasDelete
  if (actionType === 'guided_chat') return !!opts.hasGuidedChat
  return true
}
