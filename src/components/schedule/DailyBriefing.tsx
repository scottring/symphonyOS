import { useState } from 'react'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'
import { OutcomePicker, type ActionOutcome } from './OutcomePicker'

interface DailyBriefingProps {
  suggestions: ProactiveSuggestion[]
  onAct: (suggestionId: string, detail?: string, outcome?: string) => void
  onDismiss: (suggestionId: string) => void
  onSelectTask: (taskId: string) => void
  onOpenGuidedChat?: (entityType: 'task' | 'contact' | 'project' | 'event', entityId: string, entityName: string, prompt?: string) => void
  lastUpdated: Date | null
}

const ACTION_ICONS: Record<string, string> = {
  call: '\u260F',
  text: '\u{1F4AC}',
  email: '\u2709',
  open_link: '\u2192',
  navigate: '\u{1F4CD}',
  followup: '\u21BB',
  guided_chat: '\u{1F4AD}',
  create_task: '\u2795',
  someday: '\u23F3',
  stale: '?',
  do_today: '\u2714',
}

export function DailyBriefing({
  suggestions,
  onAct,
  onDismiss,
  onSelectTask,
  onOpenGuidedChat,
  lastUpdated,
}: DailyBriefingProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [pendingOutcome, setPendingOutcome] = useState<{
    suggestionId: string
    actionType: string
    detail: string
  } | null>(null)

  if (suggestions.length === 0) return null

  const handleAction = (s: ProactiveSuggestion) => {
    const payload = s.actionPayload
    const actionType = s.actionType || s.suggestionType

    switch (actionType) {
      case 'call':
        if (payload.phoneNumber) {
          window.open(`tel:${payload.phoneNumber}`, '_self')
          setPendingOutcome({
            suggestionId: s.id,
            actionType: 'call',
            detail: `Called ${payload.phoneNumber}`,
          })
        }
        break
      case 'email':
        if (payload.email) {
          const subject = payload.subject ? `?subject=${encodeURIComponent(String(payload.subject))}` : ''
          window.open(`mailto:${payload.email}${subject}`, '_blank')
          onAct(s.id, `Emailed ${payload.email}`, 'sent')
        }
        break
      case 'text':
        if (payload.phoneNumber) {
          const body = payload.messageTemplate ? `&body=${encodeURIComponent(String(payload.messageTemplate))}` : ''
          window.open(`sms:${payload.phoneNumber}${body}`, '_self')
          onAct(s.id, `Texted ${payload.phoneNumber}`, 'sent')
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
      case 'guided_chat':
        if (onOpenGuidedChat) {
          const entityType = s.entityType === 'calendar_event' ? 'event' as const : s.entityType === 'task' ? 'task' as const : 'task' as const
          const guidedPrompt = payload.prompt ? String(payload.prompt) : s.detail || `Help me think through: ${s.title}`
          onOpenGuidedChat(entityType, s.entityId, s.title, guidedPrompt)
          onAct(s.id, 'Opened guided chat')
        }
        break
      default:
        if (s.entityType === 'task') {
          onSelectTask(`task-${s.entityId}`)
        } else if (s.entityType === 'calendar_event') {
          onSelectTask(`event-${s.entityId}`)
        }
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
    <div className="mb-6 animate-fade-in-up">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 mb-3 group cursor-pointer"
      >
        <h3 className="time-group-header" style={{ color: 'hsl(168 45% 35%)' }}>
          Suggestions
        </h3>
        <span className="text-xs text-neutral-400 group-hover:text-neutral-600 transition-colors">
          {suggestions.length} item{suggestions.length !== 1 ? 's' : ''}
          {lastUpdated && (
            <> &middot; {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</>
          )}
        </span>
        <svg
          className={`w-3 h-3 text-neutral-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Outcome picker overlay */}
      {pendingOutcome && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-bg-elevated border border-primary-200">
          <OutcomePicker
            actionType={pendingOutcome.actionType}
            onSelect={handleOutcomeSelect}
            onCancel={handleOutcomeCancel}
          />
        </div>
      )}

      {!collapsed && !pendingOutcome && (
        <div className="space-y-1.5">
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-bg-elevated border border-neutral-100 hover:border-primary-200 transition-colors group"
            >
              {/* Action icon */}
              <span className="text-sm flex-shrink-0 w-5 text-center">
                {ACTION_ICONS[s.actionType || s.suggestionType] || '\u2728'}
              </span>

              {/* Content — clickable */}
              <button
                onClick={() => handleAction(s)}
                className="flex-1 text-left min-w-0"
              >
                <span className="text-sm text-neutral-800 font-medium">
                  {s.title}
                </span>
                {s.detail && (
                  <span className="text-xs text-neutral-500 ml-2">
                    {s.detail}
                  </span>
                )}
              </button>

              {/* Dismiss */}
              <button
                onClick={() => onDismiss(s.id)}
                className="text-neutral-300 hover:text-neutral-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
