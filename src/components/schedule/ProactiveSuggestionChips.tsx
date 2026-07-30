import { useState } from 'react'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'
import { ConceptIcon, type ConceptName } from '@/lib/conceptIcons'
import { OutcomePicker, type ActionOutcome } from './OutcomePicker'

interface ProactiveSuggestionChipsProps {
  suggestions: ProactiveSuggestion[]
  onAct: (suggestionId: string, detail?: string, outcome?: string) => void
  onDismiss: (suggestionId: string) => void
  /** For someday action — calls onPush with 'quarter' bucket */
  onPush?: (taskId: string, target: 'quarter') => void
  /** For stale action — delete task */
  onDelete?: (taskId: string) => void
  /** For guided_chat action — opens chat with entity context */
  onOpenGuidedChat?: (entityType: 'task' | 'contact' | 'project' | 'event', entityId: string, entityName: string, prompt?: string) => void
  /** Replaces the hardcoded `ml-[6.5rem] mt-0.5 mb-2` wrapper margin classes (e.g. for non-Today layouts). Default unchanged when omitted. */
  className?: string
}

// Maps action types to ConceptName (null = non-emoji, use text fallback)
const ICON_CONCEPTS: Record<string, ConceptName | null> = {
  call: 'call',
  text: 'discussion',
  email: 'email',
  open_link: null,        // → arrow, not emoji
  navigate: 'location',
  followup: null,         // ↻ arrow, not emoji
  guided_chat: 'discussion',
  create_task: 'add',
  someday: 'time',
  stale: null,
  do_today: 'done',
}

const ICON_FALLBACKS: Record<string, string> = {
  open_link: '→',
  followup: '↻',
  stale: '?',
}

/**
 * A suggestion's chip is only worth rendering if its click handler actually
 * does something. `someday`/`stale`/`guided_chat` are no-ops in
 * ProactiveSuggestionChips.handleClick when the corresponding optional prop
 * (onPush/onDelete/onOpenGuidedChat) is absent — callers must filter those
 * out themselves before rendering (and before any top-N slice, so a dead
 * suggestion can't shadow a live one).
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

export function ProactiveSuggestionChips({
  suggestions,
  onAct,
  onDismiss: _onDismiss,
  onPush,
  onDelete,
  onOpenGuidedChat,
  className,
}: ProactiveSuggestionChipsProps) {
  const [pendingOutcome, setPendingOutcome] = useState<{
    suggestionId: string
    actionType: string
    detail: string
  } | null>(null)

  if (suggestions.length === 0 && !pendingOutcome) return null

  const handleClick = (s: ProactiveSuggestion) => {
    const payload = s.actionPayload
    const actionType = s.actionType || s.suggestionType

    switch (actionType) {
      case 'call':
        if (payload.phoneNumber) {
          window.open(`tel:${payload.phoneNumber}`, '_self')
          // Show outcome picker instead of immediately resolving
          setPendingOutcome({
            suggestionId: s.id,
            actionType: 'call',
            detail: `Called ${payload.phoneNumber}`,
          })
        }
        break
      case 'text':
        if (payload.phoneNumber) {
          const body = payload.messageTemplate ? `&body=${encodeURIComponent(String(payload.messageTemplate))}` : ''
          window.open(`sms:${payload.phoneNumber}${body}`, '_self')
          onAct(s.id, `Texted ${payload.phoneNumber}`, 'sent')
        }
        break
      case 'email':
        if (payload.email) {
          const subject = payload.subject ? `?subject=${encodeURIComponent(String(payload.subject))}` : ''
          window.open(`mailto:${payload.email}${subject}`, '_blank')
          onAct(s.id, `Emailed ${payload.email}`, 'sent')
        }
        break
      case 'open_link':
        if (payload.url) {
          window.open(String(payload.url), '_blank')
          onAct(s.id, `Opened ${payload.url}`, 'success')
        }
        break
      case 'navigate':
        if (payload.location) {
          const q = payload.placeId
            ? `https://www.google.com/maps/place/?q=place_id:${payload.placeId}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(payload.location))}`
          window.open(q, '_blank')
          onAct(s.id, `Navigated to ${payload.location}`)
        }
        break
      case 'someday':
        if (onPush) {
          onPush(s.entityId, 'quarter')
          onAct(s.id, 'Moved to Someday')
        }
        break
      case 'stale':
        if (onDelete) {
          onDelete(s.entityId)
          onAct(s.id, 'Deleted stale task')
        }
        break
      case 'guided_chat':
        if (onOpenGuidedChat) {
          const entityType = s.entityType === 'calendar_event' ? 'event' as const : s.entityType === 'task' ? 'task' as const : 'task' as const
          const guidedPrompt = payload.prompt ? String(payload.prompt) : s.detail || `Help me think through: ${s.title}`
          onOpenGuidedChat(entityType, s.entityId, s.title, guidedPrompt)
          onAct(s.id, 'Opened guided chat')
        }
        break
      default:
        onAct(s.id)
        break
    }
  }

  const handleOutcomeSelect = (outcome: ActionOutcome) => {
    if (pendingOutcome) {
      onAct(pendingOutcome.suggestionId, pendingOutcome.detail, outcome)
      setPendingOutcome(null)
    }
  }

  const handleOutcomeCancel = () => {
    if (pendingOutcome) {
      onAct(pendingOutcome.suggestionId, pendingOutcome.detail)
      setPendingOutcome(null)
    }
  }

  return (
    <>
      {pendingOutcome ? (
        <OutcomePicker
          actionType={pendingOutcome.actionType}
          onSelect={handleOutcomeSelect}
          onCancel={handleOutcomeCancel}
        />
      ) : (
        <div className={`flex gap-2 ${className ?? 'ml-[6.5rem] mt-0.5 mb-2'}`}>
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => handleClick(s)}
              title={s.detail || s.title}
              className="text-xs px-2.5 py-1 rounded-full border transition-colors bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
            >
              {(() => { const concept = ICON_CONCEPTS[s.actionType || s.suggestionType]; const fallback = ICON_FALLBACKS[s.actionType || s.suggestionType]; return concept ? <ConceptIcon name={concept} decorative className="mr-1" /> : fallback ? <span className="mr-1">{fallback}</span> : <ConceptIcon name="ai" decorative className="mr-1" /> })()}
              {s.title}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
