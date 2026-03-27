import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'

interface ProactiveSuggestionChipsProps {
  suggestions: ProactiveSuggestion[]
  onAct: (suggestionId: string, detail?: string, outcome?: string) => void
  onDismiss: (suggestionId: string) => void
  /** For someday action — calls onPush with 'quarter' bucket */
  onPush?: (taskId: string, target: 'quarter') => void
  /** For stale action — delete task */
  onDelete?: (taskId: string) => void
}

const ICONS: Record<string, string> = {
  call: '\u260F',      // ☏
  text: '\u{1F4AC}',   // 💬
  email: '\u2709',     // ✉
  open_link: '\u2192', // →
  navigate: '\u{1F4CD}', // 📍
  followup: '\u21BB',  // ↻
  guided_chat: '\u{1F4AD}', // 💭
  create_task: '\u2795', // ➕
  someday: '\u23F3',   // ⏳
  stale: '?',
  do_today: '\u2714',  // ✔
}

export function ProactiveSuggestionChips({
  suggestions,
  onAct,
  onDismiss,
  onPush,
  onDelete,
}: ProactiveSuggestionChipsProps) {
  if (suggestions.length === 0) return null

  const handleClick = (s: ProactiveSuggestion) => {
    const payload = s.actionPayload

    switch (s.actionType || s.suggestionType) {
      case 'call':
        if (payload.phoneNumber) {
          window.open(`tel:${payload.phoneNumber}`, '_self')
          onAct(s.id, `Called ${payload.phoneNumber}`)
        }
        break
      case 'text':
        if (payload.phoneNumber) {
          const body = payload.messageTemplate ? `&body=${encodeURIComponent(String(payload.messageTemplate))}` : ''
          window.open(`sms:${payload.phoneNumber}${body}`, '_self')
          onAct(s.id, `Texted ${payload.phoneNumber}`)
        }
        break
      case 'email':
        if (payload.email) {
          const subject = payload.subject ? `?subject=${encodeURIComponent(String(payload.subject))}` : ''
          window.open(`mailto:${payload.email}${subject}`, '_blank')
          onAct(s.id, `Emailed ${payload.email}`)
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
      default:
        // For types without direct action (do_today, guided_chat), just mark acted
        onAct(s.id)
        break
    }
  }

  return (
    <div className="flex gap-2 ml-[6.5rem] mt-0.5 mb-2">
      {suggestions.map((s) => (
        <button
          key={s.id}
          onClick={() => handleClick(s)}
          title={s.detail || s.title}
          className="text-xs px-2.5 py-1 rounded-full border transition-colors bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
        >
          <span className="mr-1">{ICONS[s.actionType || s.suggestionType] || '\u2728'}</span>
          {s.title}
        </button>
      ))}
    </div>
  )
}
