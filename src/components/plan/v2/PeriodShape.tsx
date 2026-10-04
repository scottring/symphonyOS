// The shape of a season and of a year, drawn (Scott, 2026-10-04: "larger
// fonts and maybe some graphical components for the season and year pages").
//
//   SeasonBand   the season's months side by side, the part already lived
//                shaded, a "today" line, and its landmarks pinned below.
//   YearRibbon   twelve months tinted by the household's seasons, their
//                names above, and "today".
//
// Pictures of time, not scores: nothing here counts anyone's work.
import { periodBounds } from '@/lib/planning/periodPage'
import type { Seasons } from '@/lib/cadence/seasons'

const DAY = 86_400_000
const pct = (n: number) => `${Math.max(0, Math.min(100, n * 100))}%`

/** A calm tint per season name; a custom name gets one by its first letter. */
const TINT: Record<string, string> = { winter: 'hsl(214 32% 85%)', spring: 'hsl(120 26% 85%)', summer: 'hsl(42 62% 83%)', fall: 'hsl(28 58% 79%)', autumn: 'hsl(28 58% 79%)' }
const OTHER = ['hsl(190 30% 84%)', 'hsl(330 26% 87%)', 'hsl(260 24% 87%)', 'hsl(60 34% 82%)']
export const seasonTint = (name: string) => TINT[name.trim().toLowerCase()] ?? OTHER[name.charCodeAt(0) % OTHER.length]

export function SeasonBand({ start, end, today, marks, name }: {
  start: Date
  /** Exclusive: the next season's first day. */
  end: Date
  today: Date
  marks: { id: string; title: string; at: Date }[]
  name?: string
}) {
  const span = end.getTime() - start.getTime()
  const months: { key: string; label: string; from: number; to: number }[] = []
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const from = Math.max(start.getTime(), d.getTime())
    const to = Math.min(end.getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime())
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-US', { month: 'long' }), from: (from - start.getTime()) / span, to: (to - start.getTime()) / span })
  }
  const t = (today.getTime() - start.getTime()) / span
  const inside = t >= 0 && t < 1
  // Landmarks a few days apart would write over each other (Scott,
  // 2026-10-04): each takes the first row where its label clears the last
  // one, judged against a ~1100px band.
  const BAND_PX = 1100
  const rowEnds: number[] = []
  const shown = marks.filter((m) => m.at >= start && m.at < end).sort((a, b) => a.at.getTime() - b.at.getTime()).map((m) => {
    const at = (m.at.getTime() - start.getTime() + DAY / 2) / span
    const half = ((m.title.length * 6.6 + 16) / BAND_PX) / 2
    let row = rowEnds.findIndex((endAt) => at - half > endAt)
    if (row === -1) { row = rowEnds.length; rowEnds.push(0) }
    rowEnds[row] = at + half
    return { ...m, pos: at, row }
  })
  const tint = seasonTint(name ?? '')
  return (
    <div className="ps-band" role="img" aria-label={`${name ?? 'The season'}: ${months.map((m) => m.label).join(', ')}`}>
      <div className="ps-band-track">
        {months.map((m, i) => (
          <div key={m.key} data-testid="band-month" className="ps-band-month"
            style={{ left: pct(m.from), width: pct(m.to - m.from), background: `color-mix(in srgb, ${tint} ${100 - i * 18}%, white)` }}>{m.label}</div>
        ))}
        {inside && <>
          <div className="ps-lived" style={{ width: pct(t) }} />
          <div className="ps-today" style={{ left: pct(t) }}><span>today</span></div>
        </>}
      </div>
      {shown.length > 0 && (
        <div className="ps-pins" style={{ height: `${rowEnds.length * 30 + 6}px` }}>
          {shown.map((m) => (
            <span key={m.id} data-row={m.row} className="ps-pin" style={{ left: pct(m.pos), top: `${m.row * 30}px` }}>
              <i aria-hidden="true" />{m.title}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function YearRibbon({ year, seasons, today }: { year: number; seasons: Seasons; today: Date }) {
  const months = Array.from({ length: 12 }, (_, m) => {
    const mid = new Date(year, m, 15)
    return { m, label: mid.toLocaleDateString('en-US', { month: 'short' }), season: periodBounds('season', mid, seasons).label.replace(/\s+\d{4}$/, '') }
  })
  // Runs of months in one season, for the names above.
  const runs: { season: string; from: number; count: number }[] = []
  for (const x of months) {
    const last = runs[runs.length - 1]
    if (last && last.season === x.season) last.count++
    else runs.push({ season: x.season, from: x.m, count: 1 })
  }
  const yStart = new Date(year, 0, 1).getTime()
  const t = (today.getTime() - yStart) / (new Date(year + 1, 0, 1).getTime() - yStart)
  const inside = t >= 0 && t < 1
  return (
    <div className="ps-ribbon" role="img" aria-label={`${year}, by season`}>
      <div className="ps-ribbon-seasons">
        {runs.map((r) => <span key={`${r.season}-${r.from}`} data-testid="ribbon-season" style={{ gridColumn: `${r.from + 1} / span ${r.count}` }}>{r.season}</span>)}
      </div>
      <div className="ps-ribbon-track">
        {months.map((x) => (
          <div key={x.m} data-testid="ribbon-month" className={`ps-ribbon-month${inside && today.getMonth() === x.m ? ' is-now' : ''}`} style={{ background: seasonTint(x.season) }}>{x.label}</div>
        ))}
        {inside && <>
          <div className="ps-lived" style={{ width: pct(t) }} />
          <div className="ps-today" style={{ left: pct(t) }}><span>today</span></div>
        </>}
      </div>
    </div>
  )
}
