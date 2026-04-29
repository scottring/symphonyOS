interface TonightHeroProps {
  title: string
  imageUrl?: string
  prepMinutes?: number
  cookMinutes?: number
  feeds?: number
  /** Inline kid-acceptance sentence, e.g. "HB eggs, sweet potato, cut carrots — same table". */
  kidsLine?: string
  onViewSteps?: () => void
  onMarkDone?: () => void
}

/** Dominant visual on the Tonight page: photo/sage hero with title, stats and primary actions. */
export function TonightHero({
  title,
  imageUrl,
  prepMinutes,
  cookMinutes,
  feeds,
  kidsLine,
  onViewSteps,
  onMarkDone,
}: TonightHeroProps) {
  const stats: string[] = []
  if (prepMinutes != null) stats.push(`Prep ${prepMinutes} min`)
  if (cookMinutes != null) stats.push(`Cook ${cookMinutes} min`)
  if (feeds != null) stats.push(`Feeds ${feeds}`)

  return (
    <section className="card overflow-hidden p-0">
      {/* Photo / placeholder */}
      <div
        className={`relative aspect-[4/3] w-full ${imageUrl ? '' : 'bg-sage-100'}`}
        style={
          imageUrl
            ? {
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
        aria-hidden="true"
      />

      <div className="px-5 py-5">
        {/* Title — big stacked headline */}
        <h2 className="font-display text-[2rem] leading-[1.05] uppercase tracking-tight text-neutral-800">
          {title}
        </h2>

        {/* Stat row */}
        {stats.length > 0 && (
          <p className="mt-3 text-[13px] text-neutral-500">
            {stats.join(' · ')}
          </p>
        )}

        {/* Inline kids row */}
        {kidsLine && (
          <div className="mt-4 flex items-baseline gap-2">
            <span className="inline-flex items-center bg-sage-100 text-sage-500 text-[10px] font-bold uppercase tracking-[0.22em] px-2 py-1 rounded">
              Kids
            </span>
            <span className="font-display italic text-[14px] text-sage-500 leading-snug">
              {kidsLine}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onViewSteps}
            className="flex-1 bg-primary-500 text-white text-[13px] font-bold uppercase tracking-[0.18em] py-3.5 rounded-lg shadow-sm hover:bg-primary-600 transition-colors"
          >
            View Steps
          </button>
          <button
            type="button"
            onClick={onMarkDone}
            className="flex-1 bg-accent-500 text-white text-[13px] font-bold uppercase tracking-[0.18em] py-3.5 rounded-lg shadow-sm hover:bg-accent-600 transition-colors"
          >
            Mark Done
          </button>
        </div>
      </div>
    </section>
  )
}
