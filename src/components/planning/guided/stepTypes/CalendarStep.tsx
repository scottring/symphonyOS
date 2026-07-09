// src/components/planning/guided/stepTypes/CalendarStep.tsx
//
// Period look-ahead: fetch the horizon's date range once on mount, then show
// commitments — per-day rows for ranges up to ~9 weeks, per-month counts for
// longer spans (the annual "mountain ranges" view). Read-only; an optional
// notes field captures what's worth remembering.
import { useEffect, useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { useGuided } from '../GuidedContext'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Resolve an event's start time, preferring camelCase (possibly
 * cached/transformed) but falling back to the snake_case field the
 * google-calendar-events edge function actually emits. Returns null when
 * neither is present or the value doesn't parse to a valid date.
 */
function eventStart(e: CalendarEvent): Date | null {
  const raw = e.startTime ?? e.start_time
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function CalendarStep() {
  const { step, host, periodStart, periodEnd, notes, patchNotes } = useGuided()
  const notesKey = step.props?.notesKey

  useEffect(() => {
    if (!host.calendarConnected) return
    void host.fetchEvents(periodStart, periodEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per mount for this period
  }, [])

  const inRange = useMemo(
    () => host.events
      .map((e) => ({ e, st: eventStart(e) }))
      .filter((x): x is { e: CalendarEvent; st: Date } => x.st !== null && x.st >= periodStart && x.st <= periodEnd)
      .sort((a, b) => a.st.getTime() - b.st.getTime())
      .map((x) => x.e),
    [host.events, periodStart, periodEnd],
  )
  const wide = (periodEnd.getTime() - periodStart.getTime()) / DAY_MS > 63

  const byMonth = useMemo(() => {
    if (!wide) return []
    const counts = new Map<number, number>()
    for (const e of inRange) {
      const st = eventStart(e)
      if (!st) continue
      counts.set(st.getMonth(), (counts.get(st.getMonth()) ?? 0) + 1)
    }
    return [...counts.entries()]
  }, [inRange, wide])

  return (
    <div className="space-y-4">
      {!host.calendarConnected ? (
        <p className="text-sm text-neutral-400">
          Your calendar isn't connected right now — scan your calendar app instead, then note anything worth remembering below.
        </p>
      ) : inRange.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing on the calendar in this stretch yet.</p>
      ) : wide ? (
        <ul className="space-y-1">
          {byMonth.map(([m, count]) => (
            <li key={m} className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
              <CalendarDays className="w-3.5 h-3.5 text-neutral-300" />
              <span className="flex-1">{MONTHS[m]}</span>
              <span className="text-xs text-neutral-400">{count} commitment{count === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1 max-h-72 overflow-auto pr-1">
          {inRange.map((e) => {
            const st = eventStart(e)
            return (
              <li key={e.id ?? `${e.title}-${st?.toISOString() ?? ''}`}
                className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
                <span className="shrink-0 w-24 text-xs text-neutral-400">
                  {st?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <span className="flex-1 min-w-0 truncate">{e.title}</span>
              </li>
            )
          })}
        </ul>
      )}
      {notesKey && (
        <textarea
          value={(notes[notesKey] as string) ?? ''}
          onChange={(e) => patchNotes({ [notesKey]: e.target.value })}
          placeholder="Worth remembering about this stretch…"
          rows={3}
          className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      )}
    </div>
  )
}
