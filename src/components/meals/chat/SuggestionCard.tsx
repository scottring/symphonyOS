import type { Suggestion } from './types'

interface SuggestionCardProps {
  suggestion: Suggestion
  onPreview?: (s: Suggestion) => void
  onApply?: (s: Suggestion) => void
}

/** A swap-suggestion card. Kicker + original/switch lines + italic "why" + action row. */
export function SuggestionCard({ suggestion, onPreview, onApply }: SuggestionCardProps) {
  const { kicker, originalLabel, originalRecipe, switchLabel, switchRecipe, why } = suggestion

  return (
    <div className="rounded-2xl bg-bg-elevated p-4 shadow-card">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-500">
        {kicker}
      </div>

      <div className="mt-2 space-y-1 text-sm leading-relaxed text-neutral-700">
        <p>
          {originalLabel}: <span className="font-semibold text-neutral-800">{originalRecipe}</span>
        </p>
        <p>
          {switchLabel}: <span className="font-semibold text-neutral-800">{switchRecipe}</span>
        </p>
      </div>

      <p className="mt-2 font-display text-sm italic text-neutral-500">{why}</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPreview?.(suggestion)}
          className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
        >
          Preview change
        </button>
        <button
          type="button"
          onClick={() => onApply?.(suggestion)}
          className="rounded-full bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
        >
          Apply to plan
        </button>
      </div>
    </div>
  )
}
