// The Today band of the unprompted tier.
//
// Calm lines, NOT a card. Deliberately no header, no count badge, no chrome: a
// titled card with a count invites growth, which is how Today reached ~57 rows.
// A bare line list has nowhere to grow. Same visual register as RhythmNudge —
// the one proactive pattern in this app that survived contact with Scott.

import { Sparkles, X } from 'lucide-react'
import type { UnpromptedItem, UnpromptedDecisionLog } from '@/hooks/useUnpromptedSuggestions'
import { resolveSuggestionAction, actionLabel } from '@/lib/assistant/suggestionAction'

interface Props {
  items: UnpromptedItem[]
  onAct: (item: UnpromptedItem) => void
  onSnooze: (id: string, scope: 'now' | 'today') => void
  /** Populated only under ?why=1. */
  decisions?: UnpromptedDecisionLog[]
  showWhy?: boolean
}

export function UnpromptedLines({ items, onAct, onSnooze, decisions, showWhy }: Props) {
  if (items.length === 0 && !showWhy) return null

  return (
    <div className="px-3 md:px-0 space-y-1">
      {items.map((item) => {
        const s = item.suggestion
        const action = resolveSuggestionAction(s)
        return (
          <div key={s.id} className="flex items-center gap-2 text-sm min-w-0">
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary-600" aria-hidden />
            {/* Title and detail keep their NATURAL widths so they sit together
                rather than drifting apart on a short title. When the row does
                overflow, the detail shrinks four times faster, so a sprawling
                engine sentence can never truncate the thing you need to read. */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAct(item)}
                title={s.detail || s.title}
                className="min-w-0 text-left text-neutral-700 hover:text-neutral-900 hover:underline truncate"
              >
                {s.title}
              </button>
              {s.detail && (
                <span className="min-w-0 shrink-[4] text-xs text-neutral-400 truncate hidden md:inline">
                  {s.detail}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onAct(item)}
              className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-md text-primary-700 hover:bg-primary-50 transition-colors"
            >
              {actionLabel(action)}
            </button>
            <button
              type="button"
              onClick={() => onSnooze(s.id, 'now')}
              className="shrink-0 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Not now
            </button>
            <button
              type="button"
              aria-label="Not today"
              title="Not today"
              onClick={() => onSnooze(s.id, 'today')}
              className="shrink-0 p-0.5 rounded text-neutral-300 hover:text-neutral-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          </div>
        )
      })}

      {showWhy && decisions && decisions.length > 0 && (
        <div className="mt-2 rounded-md bg-neutral-50 border border-neutral-200 p-2 font-mono text-[10px] leading-relaxed text-neutral-500">
          {decisions.map(d => (
            <div key={d.id} className="truncate">
              {d.title} — urgency {d.urgency} — {d.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
