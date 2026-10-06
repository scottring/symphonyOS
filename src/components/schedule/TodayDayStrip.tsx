import { useMemo } from 'react'
import { buildDayStrip, STRIP_TICKS, type StripInput } from '@/lib/today/dayStrip'
import { formatTimeLong } from '@/lib/timeUtils'

/**
 * The day, drawn (2026-10-06, "Today, calmer"): one band from 7a to 9p under
 * the date. Calendar events in blue, timed work in green, the free stretches
 * named, and a "now" mark on today. A picture of the Schedule below it —
 * tapping a block opens that row's details, as the row would.
 */
export function TodayDayStrip({ items, now, onSelect }: {
  items: StripInput[]
  /** Today's clock; null on any other day (no "now" mark). */
  now: Date | null
  onSelect: (id: string) => void
}) {
  const strip = useMemo(() => buildDayStrip(items, { now }), [items, now])
  if (!strip.blocks.length) return null
  const half = strip.stacked
  return (
    // A picture of the Schedule below, for the eye: the rows themselves are
    // the way in for a keyboard or a screen reader, so the strip stays out of
    // both, and its labels are drawn (data-title) rather than repeated text.
    <figure className="today-day-strip" aria-hidden="true" data-testid="today-day-strip">
      <div className="today-day-strip-track">
        {strip.free.map((f) => (
          <span key={f.left} className="today-day-strip-free" style={{ left: `${f.left}%`, width: `${f.width}%` }} data-label={f.width >= 12 ? f.label : undefined} />
        ))}
        {strip.blocks.map((b) => (
          <button
            key={b.id}
            type="button"
            data-kind={b.kind}
            className={`today-day-strip-block${half ? (b.lane ? ' is-lower' : ' is-upper') : ''}`}
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
            tabIndex={-1}
            data-title={b.title}
            title={`${b.title} · ${formatTimeLong(b.start)}${b.end ? `–${formatTimeLong(b.end)}` : ''}`}
            onClick={() => onSelect(b.id)}
          />
        ))}
        {strip.now !== null && <span className="today-day-strip-now" style={{ left: `${strip.now}%` }} />}
      </div>
      <div className="today-day-strip-ticks" aria-hidden>
        {STRIP_TICKS.map((t) => <span key={t.label} style={{ left: `${t.left}%` }}>{t.label}</span>)}
        <span style={{ left: '100%' }}>9p</span>
      </div>
    </figure>
  )
}
