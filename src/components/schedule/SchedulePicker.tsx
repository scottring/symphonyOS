import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/** Matches `w-80`. Kept as a number because the position math needs it. */
const POPOVER_WIDTH = 320
/** Enough of the grid to be worth showing below before flipping above. */
const POPOVER_MAX_HEIGHT = 360

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
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Anchor to the trigger in VIEWPORT coordinates, then clamp into the window.
  //
  // This has to be a portal. The detail panel is `fixed … w-[480px]
  // overflow-y-auto` (TaskDetailPanel.tsx), and `overflow-y-auto` makes it a
  // clipping scroll container on BOTH axes — so an in-panel `absolute right-0`
  // popover 320px wide, hung off a trigger that sits ~90px in from the panel's
  // left edge, had its entire left column (Today, Tomorrow, Next weekend, This
  // month, Pick date & time…) cut off at the panel boundary. It could never
  // "grow leftward over the main view" from inside that container, whatever it
  // was anchored to. Escaping to the body is the only anchoring-independent fix.
  const place = useCallback(() => {
    const t = ref.current?.getBoundingClientRect()
    if (!t) return
    const M = 8
    const left = Math.min(
      Math.max(M, t.right - POPOVER_WIDTH),      // right-aligned to the trigger…
      window.innerWidth - POPOVER_WIDTH - M,     // …but never off either edge
    )
    const below = window.innerHeight - t.bottom
    const top = below < POPOVER_MAX_HEIGHT && t.top > below
      ? Math.max(M, t.top - Math.min(POPOVER_MAX_HEIGHT, t.top - M) - 4)
      : t.bottom + 4
    setPos({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    place()
    // The panel scrolls under the popover; keep it stuck to its trigger.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      // The popover is no longer a DOM descendant of the trigger, so a click
      // inside it would read as "outside" and close it mid-choice.
      if (ref.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
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

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
          className="fixed z-[60] rounded-xl border border-neutral-200 bg-white p-2 shadow-lg"
        >
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
        </div>,
        document.body,
      )}
    </div>
  )
}
