// src/components/planning/guided/stepTypes/CalendarStep.tsx
//
// Period look-ahead: fetch the horizon's date range once on mount, then show
// commitments — per-day rows for ranges up to ~9 weeks, per-month counts for
// longer spans (the annual "mountain ranges" view). Read-only; an optional
// notes field captures what's worth remembering.
import { useEffect, useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { useGuided } from '../GuidedContext'

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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
      .filter((e) => {
        const st = e.startTime instanceof Date ? e.startTime : new Date(e.startTime ?? '')
        return st >= periodStart && st <= periodEnd
      })
      .sort((a, b) => {
        const ast = a.startTime instanceof Date ? a.startTime : new Date(a.startTime ?? '')
        const bst = b.startTime instanceof Date ? b.startTime : new Date(b.startTime ?? '')
        return ast.getTime() - bst.getTime()
      }),
    [host.events, periodStart, periodEnd],
  )
  const wide = (periodEnd.getTime() - periodStart.getTime()) / DAY_MS > 63

  const byMonth = useMemo(() => {
    if (!wide) return []
    const counts = new Map<number, number>()
    for (const e of inRange) {
      const st = e.startTime instanceof Date ? e.startTime : new Date(e.startTime ?? '')
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
          {inRange.map((e) => (
            <li key={e.id ?? `${e.title}-${e.startTime?.toString() ?? ''}`}
              className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
              <span className="shrink-0 w-24 text-xs text-neutral-400">
                {(() => {
                  const st = e.startTime instanceof Date ? e.startTime : new Date(e.startTime ?? '')
                  return st.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                })()}
              </span>
              <span className="flex-1 min-w-0 truncate">{e.title}</span>
            </li>
          ))}
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
