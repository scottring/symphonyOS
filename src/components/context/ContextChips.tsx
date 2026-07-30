import type { JSX } from 'react'
import { History } from 'lucide-react'
import { useEntityContext } from '@/hooks/useEntityContext'
import { ProactiveSuggestionChips, isActionableSuggestion } from '@/components/schedule/ProactiveSuggestionChips'
import type { SuggestionEntityType } from '@/types/proactiveSuggestion'
import { linkifyText } from '@/lib/linkifyText'

interface ContextChipsProps {
  entityType: SuggestionEntityType
  entityId: string | null
  /** 'panel' = all suggestions + last-action line; 'row' = top-1 suggestion only, no last-action */
  variant?: 'panel' | 'row'
  /** For guided_chat suggestions — opens chat with entity context */
  onOpenGuidedChat?: (entityType: 'task' | 'contact' | 'project' | 'event', entityId: string, entityName: string, prompt?: string) => void
}

// No relative-time helper exists in src/lib/ (checked for
// formatDistanceToNow/timeAgo/relativeTime) — small local one.
function daysAgo(date: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffMs = startOfDay(new Date()).getTime() - startOfDay(date).getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  return `${diffDays}d ago`
}

export function ContextChips({
  entityType,
  entityId,
  variant = 'panel',
  onOpenGuidedChat,
}: ContextChipsProps): JSX.Element | null {
  const { suggestions, lastAction, actOnSuggestion, dismissSuggestion } = useEntityContext(entityType, entityId)

  // ContextChips never wires onPush/onDelete (no someday/stale handlers here),
  // and only wires onOpenGuidedChat when a caller passes one — filter dead
  // suggestions out BEFORE the row variant's top-1 slice, so a dead
  // suggestion can't shadow a live one.
  const actionableSuggestions = suggestions.filter((s) =>
    isActionableSuggestion(s, { hasGuidedChat: !!onOpenGuidedChat })
  )
  const visibleSuggestions = variant === 'row' ? actionableSuggestions.slice(0, 1) : actionableSuggestions
  const showLastAction = variant === 'panel' && lastAction !== null

  if (visibleSuggestions.length === 0 && !showLastAction) return null

  // A single wrapping element (not a Fragment) so callers that stack this
  // inside a `divide-y [&>*]:py-4` list (TapContextPanel) get one row, not
  // one per part — a Fragment's children land as separate direct children
  // of whatever divide-y container hosts this component.
  return (
    <div className="space-y-1">
      {visibleSuggestions.length > 0 && (
        <ProactiveSuggestionChips
          suggestions={visibleSuggestions}
          onAct={actOnSuggestion}
          onDismiss={dismissSuggestion}
          onOpenGuidedChat={onOpenGuidedChat}
          className="ml-0"
        />
      )}
      {showLastAction && lastAction && (
        <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-2">
          <History size={16} className="text-neutral-400" />
          {/* Linkified: action_history details embed the URL that was opened, and
              rendering it as dead text meant you could see the link you followed
              but not follow it again. stopPropagation so the click opens the link
              rather than the row behind it. */}
          <span>
            {linkifyText(
              `Last: ${lastAction.detail || lastAction.actionType}${lastAction.outcome ? ` — ${lastAction.outcome.replace('_', ' ')}` : ''} · ${daysAgo(lastAction.createdAt)}`
            )}
          </span>
        </div>
      )}
    </div>
  )
}
