// src/components/planning/season/SeasonMonthStrips.tsx
//
// The season as three month strips — the same instrument as the year ribbon,
// one zoom closer. The season rung places into a MONTH, so a month is the
// finest thing this drawing shows.
//
// Widths are proportional to days in the month and elapsed time is shaded
// across the whole row, so "how much of this season is left" is a glance, not
// a caption. Each strip reports what is already claimed (multi-day claims by
// name, everything else as a count) and how many moves have been filed into it.
//
// Rendered by BOTH /season and the seasonal session's `season-ahead` step —
// this component is what closes the one page↔wizard parity gap the audit found.
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { multiDayClaims, fractionOfSpan } from '@/lib/planning/timeAxis'

interface SeasonMonthStripsProps {
  /** Any date inside the season's first month. */
  seasonStart: Date
  tasks: readonly Task[]
  events: readonly CalendarEvent[]
  now?: Date
  onOpenMonth?: (monthStart: Date) => void
}

/** At or below this many claimed items, a month reads as open runway. */
const WIDE_OPEN_AT = 2

export function SeasonMonthStrips({
  seasonStart,
  tasks,
  events,
  now = new Date(),
  onOpenMonth,
}: SeasonMonthStripsProps) {
  const months = useMemo(() => {
    const out = []
    for (let i = 0; i < 3; i++) {
      const start = new Date(seasonStart.getFullYear(), seasonStart.getMonth() + i, 1)
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59)
      out.push({ start, end, days: end.getDate() })
    }
    return out
  }, [seasonStart])

  const spanStart = months[0].start
  const spanEnd = months[2].end
  const elapsedPct = fractionOfSpan(now, spanStart, spanEnd) * 100
  const withinSeason = now >= spanStart && now <= spanEnd

  const claims = useMemo(
    () => multiDayClaims(events, spanStart, spanEnd, 2),
    [events, spanStart, spanEnd],
  )

  const cells = useMemo(
    () =>
      months.map(({ start, end, days }) => {
        const inMonth = (d: Date) =>
          d.getMonth() === start.getMonth() && d.getFullYear() === start.getFullYear()

        let claimed = 0
        for (const e of events) {
          const raw = e.startTime ?? e.start_time
          if (!raw) continue
          const d = new Date(raw)
          if (!Number.isNaN(d.getTime()) && inMonth(d)) claimed += 1
        }
        for (const t of tasks) {
          if (!t.scheduledFor) continue
          const d = new Date(t.scheduledFor)
          if (!Number.isNaN(d.getTime()) && inMonth(d)) claimed += 1
        }

        // Moves filed into this month: a dated move, or — for the month we're
        // standing in — the undated bucket='month' pool, which is what "this
        // month's list" means before anything is placed.
        const isCurrent = inMonth(now)
        const moves = tasks.filter((t) => {
          if (t.completed) return false
          if (t.scheduledFor) return inMonth(new Date(t.scheduledFor))
          return isCurrent && t.bucket === 'month'
        }).length

        return {
          start,
          days,
          isCurrent,
          isPast: end < now,
          claimed,
          moves,
          claims: claims.filter((c) => inMonth(c.start)),
          label: start.toLocaleDateString('en-US', { month: 'long' }),
        }
      }),
    [months, tasks, events, claims, now],
  )

  return (
    <div className="relative">
      <div className="flex gap-1.5">
        {cells.map((c) => {
          const wideOpen = c.claimed <= WIDE_OPEN_AT && !c.isPast
          const Wrapper = onOpenMonth ? 'button' : 'div'
          return (
            <Wrapper
              key={c.start.toISOString()}
              data-testid={`strip-${c.start.getMonth()}`}
              {...(onOpenMonth
                ? { type: 'button' as const, onClick: () => onOpenMonth(c.start) }
                : {})}
              style={{ flex: c.days }}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                onOpenMonth ? 'hover:bg-neutral-50' : ''
              } ${
                wideOpen
                  ? 'border-dashed border-neutral-200 bg-white'
                  : c.isCurrent
                    ? 'border-primary-200 bg-primary-50/30'
                    : 'border-neutral-200 bg-white'
              } ${c.isPast ? 'opacity-60' : ''}`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-neutral-800">{c.label}</span>
                <span className="text-[10px] text-neutral-400">
                  {c.claimed} claimed
                </span>
              </span>

              {c.claims.length > 0 ? (
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {c.claims.map((cl) => (
                    <span
                      key={cl.id}
                      className="rounded bg-primary-50 px-1.5 py-0.5 text-[9.5px] text-primary-700"
                    >
                      {cl.title}
                    </span>
                  ))}
                </span>
              ) : wideOpen ? (
                <span className="mt-1.5 block text-[10px] italic text-neutral-400">wide open</span>
              ) : null}

              <span className="mt-2 block text-[10px] text-neutral-400">
                {c.moves === 0 ? 'no moves yet' : `${c.moves} move${c.moves === 1 ? '' : 's'}`}
              </span>
            </Wrapper>
          )
        })}
      </div>

      {withinSeason && (
        <div
          aria-hidden="true"
          data-testid="season-elapsed-shade"
          className="pointer-events-none absolute inset-y-0 left-0 rounded-l-lg border-r-2 border-primary-600 bg-primary-900/[0.045]"
          style={{ width: `${elapsedPct.toFixed(1)}%` }}
        />
      )}
    </div>
  )
}
