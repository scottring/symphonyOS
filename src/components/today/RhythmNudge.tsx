// src/components/today/RhythmNudge.tsx
//
// W4 — the calm "it's time to plan" nudge. Banners/coaching were rejected as
// noise before, so this is deliberately quiet: it appears ONLY on the configured
// nudge day, is a single calm line (not a card), and is dismissible for the
// week. It never blocks — sessions always run on demand from the spine.

import { useState, useCallback } from 'react'
import { CalendarRange, X } from 'lucide-react'
import type { DueSession } from '@/lib/cadence/config'

const DISMISS_KEY = 'symphony-rhythm-nudge-dismissed'

function readDismissed(): string | null {
  try { return localStorage.getItem(DISMISS_KEY) } catch { return null }
}

interface RhythmNudgeProps {
  /** From getDueSession(config, now). Null = nothing due → renders nothing. */
  due: DueSession | null
  /** Launch the (weekly) planning session. */
  onPlan: () => void
}

export function RhythmNudge({ due, onPlan }: RhythmNudgeProps) {
  const [dismissedToken, setDismissedToken] = useState<string | null>(readDismissed)

  const dismiss = useCallback(() => {
    if (!due) return
    try { localStorage.setItem(DISMISS_KEY, due.token) } catch { /* ignore */ }
    setDismissedToken(due.token)
  }, [due])

  // Nothing due, or already dismissed for this week's token.
  if (!due || dismissedToken === due.token) return null

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-2.5">
      <CalendarRange className="w-4 h-4 text-primary-600 shrink-0" />
      <p className="text-sm text-primary-900 flex-1 min-w-0">
        It's a good time to <span className="font-medium">plan {due.label}</span>.
      </p>
      <button
        type="button"
        onClick={onPlan}
        className="shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors capitalize"
      >
        Plan {due.label}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        title="Not now"
        onClick={dismiss}
        className="shrink-0 p-1 rounded-md text-primary-400 hover:text-primary-700 hover:bg-primary-100 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
