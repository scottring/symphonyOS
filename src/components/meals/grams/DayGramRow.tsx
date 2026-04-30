import { CircleStrip } from './CircleStrip'

interface DayGramRowProps {
  /** Mon, Tue, etc. */
  dayLabel: string
  /** "May 11" */
  dateLabel: string
  /** True if the day is in the future — render an empty strip with no totals. */
  isFuture: boolean
  /** Free-text label to render in italic neutral instead of bars
   *  (e.g. "Going out", "Morning only"). */
  noteLabel?: string
  /** Sum of tracked grams for the day. */
  grams?: number
  /** Per-week target (e.g. 800). */
  target?: number | null
}

/** One row in the week table — date on the left, either a circle strip
 *  or a free-text note in the middle, and totals on the right. */
export function DayGramRow({
  dayLabel,
  dateLabel,
  isFuture,
  noteLabel,
  grams,
  target,
}: DayGramRowProps) {
  return (
    <div className="grid grid-cols-[88px_1fr_auto] items-center gap-6 py-3 border-b border-neutral-100 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-neutral-700">
          {dayLabel}
        </span>
        <span className="text-[12px] text-neutral-400">{dateLabel}</span>
      </div>

      <div className="min-w-0">
        {noteLabel ? (
          <span className="font-display italic text-[14px] text-neutral-400">
            {noteLabel}
          </span>
        ) : isFuture ? (
          <CircleStrip grams={0} />
        ) : (
          <CircleStrip grams={grams ?? 0} />
        )}
      </div>

      <div className="text-right tabular-nums">
        {!noteLabel && !isFuture && target != null && (
          <span className="text-[13px] text-neutral-700">
            <span className="font-medium">{(grams ?? 0).toLocaleString()}g</span>
            <span className="text-neutral-400"> / {target.toLocaleString()}g</span>
          </span>
        )}
      </div>
    </div>
  )
}
