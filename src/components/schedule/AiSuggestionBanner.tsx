import { Sparkles, X } from 'lucide-react'
import { useProactiveSuggestions } from '@/hooks/useProactiveSuggestions'

export function AiSuggestionBanner() {
  const { topSuggestions, actOnSuggestion, dismissSuggestion } = useProactiveSuggestions()
  const s = topSuggestions.find((x) => x.status === 'active') ?? topSuggestions[0]
  if (!s) return null

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
        onClick={() => dismissSuggestion(s.id)}
        aria-label="Dismiss suggestion"
        className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
