import { useState } from 'react'

export type ActionOutcome = 'success' | 'voicemail' | 'no_answer' | 'pending' | 'sent'

interface OutcomePickerProps {
  actionType: string
  onSelect: (outcome: ActionOutcome) => void
  onCancel: () => void
}

const OUTCOMES_BY_ACTION: Record<string, { value: ActionOutcome; label: string; icon: string }[]> = {
  call: [
    { value: 'success', label: 'Connected', icon: '✓' },
    { value: 'voicemail', label: 'Voicemail', icon: '📨' },
    { value: 'no_answer', label: 'No answer', icon: '✗' },
  ],
  text: [
    { value: 'sent', label: 'Sent', icon: '✓' },
  ],
  email: [
    { value: 'sent', label: 'Sent', icon: '✓' },
  ],
}

export function OutcomePicker({ actionType, onSelect, onCancel }: OutcomePickerProps) {
  const outcomes = OUTCOMES_BY_ACTION[actionType]
  if (!outcomes || outcomes.length <= 1) {
    // Auto-resolve for actions with only one outcome (text/email → sent)
    if (outcomes?.[0]) {
      // Will be called by parent after mount
    }
    return null
  }

  return (
    <div className="flex items-center gap-1.5 ml-8 mt-0.5 mb-2 animate-fade-in-up">
      <span className="text-xs text-neutral-400 mr-1">How'd it go?</span>
      {outcomes.map((o) => (
        <button
          key={o.value}
          onClick={() => onSelect(o.value)}
          className="text-xs px-2 py-1 rounded-full border transition-colors bg-white border-neutral-200 text-neutral-600 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700"
        >
          <span className="mr-1">{o.icon}</span>
          {o.label}
        </button>
      ))}
      <button
        onClick={onCancel}
        className="text-xs px-1.5 py-1 text-neutral-300 hover:text-neutral-500 transition-colors"
        title="Skip"
      >
        skip
      </button>
    </div>
  )
}

/**
 * Hook to manage outcome picker state.
 * Returns the pending action info and handlers for the outcome flow.
 */
export function useOutcomePicker() {
  const [pending, setPending] = useState<{
    suggestionId: string
    actionType: string
    detail: string
  } | null>(null)

  const startOutcomePick = (suggestionId: string, actionType: string, detail: string) => {
    // Only show picker for call actions (text/email auto-resolve to 'sent')
    if (actionType === 'call') {
      setPending({ suggestionId, actionType, detail })
    }
  }

  const clear = () => setPending(null)

  return { pending, startOutcomePick, clear }
}
