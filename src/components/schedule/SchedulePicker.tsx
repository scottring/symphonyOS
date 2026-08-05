import { useEffect, useRef, useState } from 'react'
import { ConceptIcon } from '@/lib/conceptIcons'
import { EVENING_WINDOW, type DayLoad } from '@/lib/today/dayLoad'
import { getBaseDate, getNextWeekend, getWeekendAfterNext, getNextMonday } from '@/lib/dateHelpers'
import type { TriageWhen } from './TriageWhenMenu'
import { RescheduleGrid, loadKeyFor } from './RescheduleGrid'
import { DayPeek } from './DayPeek'

/**
 * The tiles that resolve to a concrete day, and can therefore carry a fullness
 * readout. The pool whens — this-week, this-month, someday — have no day to
 * measure and get no entry.
 */
export const DATED_WHENS: {
  when: TriageWhen
  date: () => Date
  window?: { startHour: number; endHour: number }
}[] = [
  { when: 'today', date: () => getBaseDate(0) },
  { when: 'tonight', date: () => getBaseDate(0), window: EVENING_WINDOW },
  { when: 'tomorrow', date: () => getBaseDate(1) },
  { when: 'this-weekend', date: getNextWeekend },
  { when: 'next-weekend', date: getWeekendAfterNext },
  { when: 'next-week', date: getNextMonday },
]

/** Loads-map key for a date: local `YYYY-MM-DD`. */
export function dayLoadKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface SchedulePickerProps {
  /** Current schedule, if any — enables "Clear schedule". */
  scheduledFor?: Date
  onSchedule: (date: Date, isAllDay: boolean) => void
  onReschedule?: (when: TriageWhen) => void
  onClearSchedule?: () => void
  /** Fullness per dated tile, keyed by `loadKeyFor(when)`. */
  loads: Map<string, DayLoad>
  /** Trigger text. Defaults to "Schedule"; the event panel says "Reschedule". */
  label?: string
}

const TRIGGER =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ' +
  'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors'

/**
 * The one scheduler.
 *
 * The task panel used to wrap RescheduleGrid in its own popover chrome while the
 * event panel used SchedulePopover — two surfaces answering the same question in
 * two different ways, neither of which told you anything about the day you were
 * choosing. This one carries the fullness readout, and a tile's bar opens that
 * day's agenda without leaving the popover.
 */
export function SchedulePicker({
  scheduledFor,
  onSchedule,
  onReschedule,
  onClearSchedule,
  loads,
  label = 'Schedule',
}: SchedulePickerProps) {
  const [open, setOpen] = useState(false)
  const [peek, setPeek] = useState<DayLoad | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Reopening should start at the grid, not wherever the last visit ended.
  useEffect(() => {
    if (!open) setPeek(null)
  }, [open])

  const close = () => setOpen(false)

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={TRIGGER}>
        <ConceptIcon name="when" decorative /> {label}
      </button>

      {open && (
        // Right-anchored so it grows LEFTWARD over the main view. The panel is
        // ~360px wide and the trigger sits well into the chip row, so a
        // left-anchored 320px popover ran off the edge of the screen.
        <div className="absolute right-0 z-50 mt-1 w-80 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
          {peek ? (
            <DayPeek
              load={peek}
              onBack={() => setPeek(null)}
              onSchedule={(date, isAllDay) => {
                close()
                onSchedule(date, isAllDay)
              }}
            />
          ) : (
            <>
              <div className="px-1 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">
                {label} for
              </div>
              <RescheduleGrid
                loads={loads}
                onPeek={(_date, when) => {
                  const load = loads.get(loadKeyFor(when))
                  if (load) setPeek(load)
                }}
                onPick={(when) => {
                  close()
                  onReschedule?.(when)
                }}
                onPickDate={(date, isAllDay) => {
                  close()
                  onSchedule(date, isAllDay)
                }}
              />
              {scheduledFor && onClearSchedule && (
                <button
                  type="button"
                  onClick={() => {
                    close()
                    onClearSchedule()
                  }}
                  className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50"
                >
                  Clear schedule
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
