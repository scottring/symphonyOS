import type { Suggestion } from './types'

interface SuggestionCardProps {
  suggestion: Suggestion
  onPreview?: (s: Suggestion) => void
  onApply?: (s: Suggestion) => void
}

/** Verb shown on the Apply button, by card kind. */
const APPLY_LABEL: Record<Suggestion['kind'], string> = {
  add:    'Add to plan',
  swap:   'Apply swap',
  remove: 'Remove',
}

/** A suggestion card. Kicker + title + italic "why" + action row.
 *  Shape matches AskSymphonySuggestion (kind: add | swap | remove). */
export function SuggestionCard({ suggestion, onPreview, onApply }: SuggestionCardProps) {
  const { kicker, title, why, kind } = suggestion

  return (
    <div className="rounded-2xl bg-bg-elevated p-4 shadow-card">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-500">
        {kicker}
      </div>

      <p className="mt-2 text-sm font-semibold leading-relaxed text-neutral-800">
        {title}
      </p>

      {why && (
        <p className="mt-2 font-display text-sm italic text-neutral-500">{why}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPreview?.(suggestion)}
          className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => onApply?.(suggestion)}
          className="rounded-full bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
        >
          {APPLY_LABEL[kind]}
        </button>
      </div>
    </div>
  )
}
