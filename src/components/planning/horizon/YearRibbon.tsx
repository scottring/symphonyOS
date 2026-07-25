// src/components/planning/horizon/YearRibbon.tsx
//
// The year as ONE axis, left to right — replacing the twelve equal boxes that
// gave January and December the same weight in a year you are 56% through.
//
// Four layers share a single time scale:
//   month ticks     the scale you read positions against
//   season segments the rung directly below, so the descent is visible here
//   claim bars      genuine multi-day commitments, plotted where they fall
//   density strip   one bar per week of the year — how full each week already is
// with elapsed time shaded across all of them and a today rule cutting through.
//
// The payoff is the thing no other surface in the app shows at any altitude:
// time passing against intent. A quiet stretch costs a sliver of ink instead of
// a card, so a year that stops being written in September SAYS so.
//
// READ-ONLY, deliberately. The year rung asks what's already claimed; "which
// week" is the month's decision, "which day" is the week's. Nothing is
// draggable and nothing is a drop target — see the design brief, and the fix in
// b2e2c62b that stopped this page placing straight to a date.
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import {
  monthTicks,
  seasonSegments,
  multiDayClaims,
  weekBuckets,
  fractionOfSpan,
} from '@/lib/planning/timeAxis'

interface YearRibbonProps {
  year: number
  tasks: readonly Task[]
  events: readonly CalendarEvent[]
  /** Injectable clock — the tests pin a date rather than mocking time. */
  now?: Date
}

const CLAIM_LABEL_ROWS = 3

export function YearRibbon({ year, tasks, events, now = new Date() }: YearRibbonProps) {
  const start = useMemo(() => new Date(year, 0, 1), [year])
  const end = useMemo(() => new Date(year, 11, 31, 23, 59, 59), [year])

  const ticks = useMemo(() => monthTicks(year), [year])
  const segments = useMemo(() => seasonSegments(year), [year])
  const claims = useMemo(() => multiDayClaims(events, start, end, 2), [events, start, end])

  // Density counts everything that lands on a date — events and scheduled
  // tasks alike. At this altitude the distinction doesn't matter; "how much of
  // that week is already spoken for" does.
  const density = useMemo(() => {
    const dates: Date[] = []
    for (const e of events) {
      const raw = e.startTime ?? e.start_time
      if (!raw) continue
      const d = new Date(raw)
      if (!Number.isNaN(d.getTime())) dates.push(d)
    }
    for (const t of tasks) {
      if (!t.scheduledFor) continue
      const d = new Date(t.scheduledFor)
      if (!Number.isNaN(d.getTime())) dates.push(d)
    }
    return weekBuckets(dates, start, end)
  }, [events, tasks, start, end])

  const maxCount = useMemo(
    () => density.reduce((m, b) => (b.count > m ? b.count : m), 0) || 1,
    [density],
  )

  const isThisYear = now.getFullYear() === year
  const elapsedPct = isThisYear ? fractionOfSpan(now, start, end) * 100 : now > end ? 100 : 0
  const currentSeason = Math.floor(now.getMonth() / 3)
  const currentWeekIndex = useMemo(
    () => density.findIndex((b) => {
      const wEnd = new Date(b.weekStart)
      wEnd.setDate(wEnd.getDate() + 7)
      return now >= b.weekStart && now < wEnd
    }),
    [density, now],
  )

  // Stagger labels so two claims a fortnight apart don't overprint. A label
  // drops to the next row whenever it starts within 7% of the previous one.
  const claimRows = useMemo(() => {
    const rows: number[] = []
    let lastPctInRow: number[] = new Array(CLAIM_LABEL_ROWS).fill(-Infinity)
    claims.forEach((c) => {
      let row = 0
      for (let r = 0; r < CLAIM_LABEL_ROWS; r++) {
        if (c.startPct - lastPctInRow[r] > 7) { row = r; break }
        row = (r + 1) % CLAIM_LABEL_ROWS
      }
      lastPctInRow[row] = c.startPct
      rows.push(row)
    })
    lastPctInRow = []
    return rows
  }, [claims])

  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1
  const daysInYear = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1

  return (
    <div className="select-none">
      {/* Month ticks — the scale */}
      <div className="relative h-4 text-[9.5px] tracking-[0.06em] text-neutral-400">
        {ticks.map((t) => (
          <span key={t.label} className="absolute top-0" style={{ left: `${t.pct}%` }}>
            {t.label}
          </span>
        ))}
      </div>

      <div className="relative">
        {/* Season segments — the rung below, on the same scale */}
        <div className="relative flex h-7 overflow-hidden rounded-md bg-neutral-100">
          {segments.map((s) => {
            const isCurrent = isThisYear && s.index === currentSeason
            return (
              <div
                key={s.label}
                style={{ width: `${s.widthPct}%` }}
                className={`flex items-center border-r border-white/80 pl-2.5 text-[10px] uppercase tracking-[0.09em] last:border-r-0 ${
                  isCurrent ? 'font-semibold text-primary-700' : 'text-neutral-400'
                }`}
              >
                {s.label}
              </div>
            )
          })}
        </div>

        {/* Claim bars — what genuinely eats days */}
        <div className="relative mt-1.5" style={{ height: `${16 + CLAIM_LABEL_ROWS * 12}px` }}>
          {claims.map((c, i) => (
            <div key={c.id}>
              <div
                className="absolute top-0 h-3.5 rounded-sm bg-primary-300"
                style={{ left: `${c.startPct}%`, width: `${c.widthPct}%` }}
              />
              <div
                className="absolute whitespace-nowrap text-[9px] text-neutral-500"
                style={{
                  left: `${Math.min(c.startPct, 92)}%`,
                  top: `${16 + claimRows[i] * 12}px`,
                }}
              >
                {c.title}
              </div>
            </div>
          ))}
        </div>

        {/* Density — one bar per week, the shape of the year's commitments */}
        <div className="mt-0.5 flex h-11 items-end gap-px">
          {density.map((b, i) => {
            const isPast = isThisYear && i < currentWeekIndex
            const isCurrent = isThisYear && i === currentWeekIndex
            const tone = isCurrent
              ? 'bg-primary-500'
              : isPast
                ? 'bg-primary-200'
                : 'bg-neutral-200'
            return (
              <div
                key={b.weekStart.toISOString()}
                data-testid="density-bar"
                title={`Week of ${b.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${b.count}`}
                className={`flex-1 rounded-t-sm ${b.count === 0 ? 'bg-neutral-100' : tone}`}
                style={{ height: b.count === 0 ? '1px' : `${Math.max(6, (b.count / maxCount) * 100)}%` }}
              />
            )
          })}
        </div>

        {/* Elapsed shade + today rule, over every layer at once */}
        {isThisYear && (
          <>
            <div
              data-testid="elapsed-shade"
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 bottom-0 rounded-l-md border-r-2 border-primary-600 bg-primary-900/[0.045]"
              style={{ width: `${elapsedPct.toFixed(1)}%` }}
            />
            <div
              className="pointer-events-none absolute -top-4 -translate-x-1/2 bg-bg-base px-1 text-[9px] font-semibold tracking-wide text-primary-700"
              style={{ left: `${elapsedPct.toFixed(1)}%` }}
            >
              TODAY
            </div>
          </>
        )}
      </div>

      {isThisYear && (
        <p className="mt-3 border-l-2 border-primary-200 pl-3 text-[12.5px] leading-relaxed text-neutral-500">
          Day {dayOfYear} of {daysInYear}.{' '}
          {claims.length > 0 && (
            <>
              {claims.filter((c) => c.end >= now).length} multi-day claim
              {claims.filter((c) => c.end >= now).length === 1 ? '' : 's'} still ahead.{' '}
            </>
          )}
          {(() => {
            const lastWritten = [...density].reduce((acc, b, i) => (b.count > 0 ? i : acc), -1)
            if (lastWritten < 0 || lastWritten >= density.length - 1) return null
            const from = density[lastWritten + 1].weekStart
            return (
              <>
                Nothing is written after{' '}
                <strong className="font-semibold text-neutral-700">
                  {from.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                </strong>{' '}
                — {density.length - 1 - lastWritten} weeks of runway.
              </>
            )
          })()}
        </p>
      )}
    </div>
  )
}
