import { Sparkles, ChevronRight } from 'lucide-react'

interface EndOfDayCardProps {
  onOpenReview: () => void
}

/**
 * Closing card at the bottom of the Today timeline. Provides a quiet
 * chapter ending — "the day is wrapping up here" — and a single CTA into
 * a reflection/handoff flow (wired in Phase 2).
 */
export function EndOfDayCard({ onOpenReview }: EndOfDayCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenReview}
      aria-label="End of day review"
      className="
        w-full flex items-center gap-4 px-4 py-3 mt-4 rounded-xl
        bg-bg-elevated border border-neutral-200/60
        hover:border-neutral-300 hover:bg-neutral-50/60
        transition-colors text-left
      "
    >
      <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 text-primary-600">
        <Sparkles className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base text-neutral-800 leading-tight">End of day review</p>
        <p className="text-[12px] text-neutral-500 leading-snug">Reflect, prep for tomorrow, and close the day.</p>
      </div>
      <ChevronRight className="w-5 h-5 text-neutral-300 shrink-0" />
    </button>
  )
}
