interface UpcomingDayRowProps {
  /** e.g. "Tue" — short day label. */
  dayLabel: string
  /** Resolved title: recipe title, ad-hoc title, or note phrase like "Going out". */
  title: string
  /** When true, render the title in a muted italic style (e.g. "Going out"). */
  muted?: boolean
}

/** A single row in the "This Week" upcoming-days list. */
export function UpcomingDayRow({ dayLabel, title, muted = false }: UpcomingDayRowProps) {
  return (
    <li className="flex items-baseline gap-3 py-2.5 border-b border-neutral-100 last:border-b-0">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 w-10 shrink-0">
        {dayLabel}
      </span>
      <span
        className={`flex-1 text-[15px] ${
          muted
            ? 'font-display italic text-neutral-400'
            : 'text-neutral-700'
        }`}
      >
        {title}
      </span>
    </li>
  )
}
