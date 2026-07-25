// src/components/planning/guided/stepTypes/CalendarStep.tsx
//
// Period look-ahead: fetch the horizon's date range once on mount, then show
// commitments — per-day rows for ranges up to ~9 weeks, per-month counts for
// longer spans (the annual "mountain ranges" view). Read-only; an optional
// notes field captures what's worth remembering.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { useGuided } from '../GuidedContext'
import { YearRibbon } from '@/components/planning/horizon/YearRibbon'
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
  // Annual "mountain ranges": show the 12-month landscape (with zoom-into-month)
  // instead of the per-month commitment counts. Year session only.
  const landscape = step.props?.landscape === true
  const landscapeYear = periodStart.getFullYear()

  // A look-AHEAD never shows the past: mid-period sessions clamp the window to
  // today (week-boundary spec). The landscape keeps the full year — it maps
  // terrain, including what already happened.
  const viewStart = useMemo(() => {
    if (landscape) return periodStart
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return periodStart.getTime() > today.getTime() ? periodStart : today
  }, [landscape, periodStart])

  // fetchEvents REPLACES the app-wide GoogleCalendarProvider cache as a side
  // effect (it's shared with Today's timeline). A wide guided-session range
  // (e.g. the annual session's Jan–Dec scan) would otherwise clobber that
  // cache for the rest of the app. Keep this step's own copy of the fetched
  // events instead of reading the shared `host.events`.
  const [fetchedEvents, setFetchedEvents] = useState<CalendarEvent[]>([])

  // Fetch once — but only once CONNECTED. The provider re-validates the
  // Google connection when a session opens (an edge-function round trip), so
  // `calendarConnected` can flip true seconds after this step mounts; keying
  // the effect on it (with a once-guard) catches that late flip instead of
  // stranding the step on a mount-time snapshot.
  const fetchedRef = useRef(false)
  useEffect(() => {
    if (!host.calendarConnected || fetchedRef.current) return
    fetchedRef.current = true
    let cancelled = false
    void host.fetchEvents(viewStart, periodEnd).then((result) => {
      if (!cancelled) setFetchedEvents(result)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when first connected
  }, [host.calendarConnected])

  const inRange = useMemo(
    () => fetchedEvents
      .map((e) => ({ e, st: eventStart(e) }))
      .filter((x): x is { e: CalendarEvent; st: Date } => x.st !== null && x.st >= viewStart && x.st <= periodEnd)
      .sort((a, b) => a.st.getTime() - b.st.getTime())
      .map((x) => x.e),
    [fetchedEvents, viewStart, periodEnd],
  )
  const wide = (periodEnd.getTime() - viewStart.getTime()) / DAY_MS > 63

  const byMonth = useMemo(() => {
    if (!wide) return []
    const groups = new Map<number, CalendarEvent[]>()
    for (const e of inRange) {
      const st = eventStart(e)
      if (!st) continue
      const arr = groups.get(st.getMonth()) ?? []
      arr.push(e)
      groups.set(st.getMonth(), arr)
    }
    return [...groups.entries()]
  }, [inRange, wide])
  // Expand a month to its actual events — the count alone is a dead end (#9).
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set())
  const toggleMonth = (m: number) =>
    setExpandedMonths((s) => {
      const n = new Set(s)
      if (n.has(m)) n.delete(m); else n.add(m)
      return n
    })

  return (
    <div className="space-y-4">
      {landscape ? (
        <>
          <p className="text-xs text-neutral-400">
            Your year on one axis — seasons, what's already claimed, and how full each week is.
          </p>
          {!host.calendarConnected && !host.calendarChecking && (
            <p className="text-xs text-neutral-400">
              Your calendar isn't connected — you'll still see your dated items below; connect it to layer in events too.
            </p>
          )}
          {/* The SAME component the /year page renders. Parity across page and
              session isn't maintained here, it's structural: one ribbon, two
              mounts, so they cannot drift. */}
          <YearRibbon
            year={landscapeYear}
            tasks={host.tasks}
            events={fetchedEvents}
          />
        </>
      ) : host.calendarChecking && !host.calendarConnected ? (
        <p className="text-sm text-neutral-400">Checking your calendar…</p>
      ) : !host.calendarConnected ? (
        <p className="text-sm text-neutral-400">
          Your calendar isn't connected right now — scan your calendar app instead, then note anything worth remembering below.
        </p>
      ) : inRange.length === 0 ? (
        <p className="text-sm text-neutral-400">Nothing on the calendar in this stretch yet.</p>
      ) : wide ? (
        <ul className="space-y-1">
          {byMonth.map(([m, evs]) => {
            const isOpen = expandedMonths.has(m)
            return (
              <li key={m} className="rounded-lg bg-neutral-50/70">
                <button
                  type="button"
                  onClick={() => toggleMonth(m)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 text-left"
                >
                  <ChevronRight className={`w-3.5 h-3.5 text-neutral-300 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  <CalendarDays className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                  <span className="flex-1">{MONTHS[m]}</span>
                  <span className="text-xs text-neutral-400 shrink-0">{evs.length} commitment{evs.length === 1 ? '' : 's'}</span>
                </button>
                {isOpen && (
                  <ul className="pb-2 pl-9 pr-3 space-y-0.5">
                    {evs.map((e) => {
                      const st = eventStart(e)
                      return (
                        <li key={e.id ?? `${e.title}-${st?.toISOString() ?? ''}`} className="flex gap-2 text-xs text-neutral-500 leading-snug">
                          <span className="shrink-0 text-neutral-400">{st?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          <span className="min-w-0">{e.title}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
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
