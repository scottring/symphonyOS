interface Hint {
  /** Short label like "dal", "raw veg", "apple" */
  label: string
  grams: number
}

interface Props {
  hints: Hint[]
  className?: string
}

/** Comma-separated, mid-dot-joined gram hints under an editable cell.
 *  e.g. "dal 70g · raw veg 150g · apple 90g". Visually quiet — these are
 *  per-cell readouts, not the day total. */
export function GramHints({ hints, className }: Props) {
  if (hints.length === 0) return null
  return (
    <div className={`text-[11px] tracking-[0.02em] text-neutral-500 italic font-display ${className ?? ''}`}>
      {hints.map((h, i) => (
        <span key={`${h.label}-${i}`}>
          {i > 0 && <span className="mx-1.5 text-neutral-300">·</span>}
          <span>{h.label}</span>{' '}
          <span className="text-primary-500 not-italic">{h.grams}g</span>
        </span>
      ))}
    </div>
  )
}
