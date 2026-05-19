import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions'
import type { SuggestionType } from '@/types/proactiveSuggestion'

// Investigation findings (proactive-engine/index.ts):
// Rule-based generators emit: call (0.8–0.95), email (0.7–0.85), open_link (0.7),
// navigate (0.6–0.7), followup (0.75–0.9), someday (0.75), stale (0.6), do_today (0.65).
// LLM pass emits: call, text, email, open_link, guided_chat, create_task, navigate,
// followup (confidence default 0.7, clamped 0.1–1.0).
// Low-value tier: someday/stale/do_today — empty action_payload {}, no concrete action.
// navigate at 0.6 (task, no overdue bonus) also filtered by MIN_CONFIDENCE.
// Calendar attendee call is 0.5 — below the bar.
const MIN_CONFIDENCE = 0.65
const ACTIONABLE_TYPES: ReadonlySet<SuggestionType> = new Set(
  ['call', 'text', 'email', 'open_link', 'navigate', 'followup', 'create_task'] as SuggestionType[]
)

export function AiSuggestionBanner() {
  const { topSuggestions, actOnSuggestion, dismissSuggestion } = useProactiveSuggestions()
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(new Set())

  const s = topSuggestions
    .filter((x) =>
      x.status === 'active' &&
      x.confidence >= MIN_CONFIDENCE &&
      ACTIONABLE_TYPES.has(x.suggestionType) &&
      !dismissedKeys.has(x.suggestionKey))
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0]

  if (!s) return null

  const handleDismiss = () => {
    setDismissedKeys((prev) => new Set([...prev, s.suggestionKey]))
    dismissSuggestion(s.id)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-50/60 border border-primary-100">
      <Sparkles className="w-4 h-4 text-primary-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-600">AI suggestion</p>
        <p className="text-sm text-neutral-700 truncate">
          {s.title}{s.detail ? <span className="text-neutral-500"> — {s.detail}</span> : null}
        </p>
      </div>
      <button
        onClick={() => actOnSuggestion(s.id)}
        className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors"
      >
        Act
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss suggestion"
        className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
