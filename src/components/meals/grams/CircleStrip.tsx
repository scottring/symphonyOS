/** Five-dot bar where each dot represents 200g of vegetables.
 *  Mon = 5 of 5 filled (1000g), with an "+over" badge if the user
 *  blew past target. Pure presentational — no data fetching. */
interface CircleStripProps {
  grams: number
  /** Per-dot increment in grams. Defaults to 200 (5 dots × 200 = 1000g). */
  perDot?: number
  /** Total dots in the strip. Defaults to 5. */
  total?: number
}

export function CircleStrip({ grams, perDot = 200, total = 5 }: CircleStripProps) {
  const filled = Math.min(total, Math.max(0, Math.round(grams / perDot)))
  const cap = total * perDot
  const isOver = grams > cap

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5" aria-label={`${filled} of ${total} dots filled`}>
        {Array.from({ length: total }).map((_, i) => {
          const isFilled = i < filled
          return (
            <span
              key={i}
              className={
                isFilled
                  ? 'h-3 w-3 rounded-full bg-primary-500'
                  : 'h-3 w-3 rounded-full border-2 border-neutral-200 bg-transparent'
              }
            />
          )
        })}
      </div>
      {isOver && (
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-500">
          +over
        </span>
      )}
    </div>
  )
}
