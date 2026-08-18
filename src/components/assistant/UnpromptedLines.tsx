// The Today band of the unprompted tier.
//
// Still NOT a card: no header, no count badge, no container. A titled card with
// a count invites growth, which is how Today reached ~57 rows. A bare line list
// has nowhere to grow, and that property is load-bearing — don't add a wrapper.
//
// Collapsed by default (2026-08-18): the full-size reasoning paragraph made the
// assistant the loudest voice on a sparse day — a four-line lecture above the
// user's actual schedule. The suggestion now costs one quiet line ("1
// suggestion") until the user asks for it; expanding restores the full-size
// sentence with room to wrap, because a truncated reason still can't be judged.
// The fixed-budget rule survives either way: collapsed is one line at one
// suggestion and one line at ten.

import { useState } from 'react'
import { ChevronDown, ChevronRight, Sparkles, X } from 'lucide-react'
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
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0 && !showWhy) return null

  return (
    <div className="px-3 md:px-0 mb-4">
      {items.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-2 py-1 text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary-600/80" aria-hidden />
          <span className="font-medium">
            {items.length === 1 ? '1 suggestion' : `${items.length} suggestions`}
          </span>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-neutral-300" aria-hidden />
            : <ChevronRight className="w-3.5 h-3.5 text-neutral-300" aria-hidden />}
        </button>
      )}

      {expanded && (
        <div className="mt-2 space-y-3">
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
        </div>
      )}

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
