// The Today band of the unprompted tier.
//
// Still NOT a card: no header, no count badge, no container. A titled card with
// a count invites growth, which is how Today reached ~57 rows. A bare line list
// has nowhere to grow, and that property is load-bearing — don't add a wrapper.
//
// Visibility is owned entirely by the ⋯ menu's "Show suggestions · N" toggle
// (2026-08-18): an on-page collapsed line duplicated that control and still
// cost a row. When this renders at all, the user asked for it — so the full
// reasoning gets room to wrap; a truncated reason can't be judged.

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
    <div className="px-3 md:px-0 mb-4 space-y-3">
      {items.map((item) => {
        const s = item.suggestion
        const action = resolveSuggestionAction(s)
        return (
          <div key={s.id} className="group flex items-start gap-2.5 min-w-0">
            <Sparkles className="mt-1 w-4 h-4 shrink-0 text-primary-600" aria-hidden />

            <div className="flex-1 min-w-0">
              <p className="text-[15px] leading-snug text-neutral-800">{s.title}</p>
              {/* The detail is the reasoning — why the assistant thinks this.
                  It wraps rather than truncating: a half-sentence can't be
                  trusted or dismissed on its merits. */}
              {s.detail && (
                <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">{s.detail}</p>
              )}
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onAct(item)}
                  className="text-[13px] font-medium text-primary-700 hover:underline"
                >
                  {actionLabel(action)}
                </button>
                <button
                  type="button"
                  onClick={() => onSnooze(s.id, 'now')}
                  className="text-[13px] text-neutral-400 opacity-0 transition-opacity hover:text-neutral-600 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  Not now
                </button>
              </div>
            </div>

            <button
              type="button"
              aria-label="Not today"
              title="Not today"
              onClick={() => onSnooze(s.id, 'today')}
              className="mt-0.5 shrink-0 rounded p-0.5 text-neutral-300 opacity-0 transition-opacity hover:text-neutral-600 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="w-4 h-4" aria-hidden />
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
