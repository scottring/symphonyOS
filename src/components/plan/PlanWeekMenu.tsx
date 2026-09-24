// src/components/plan/PlanWeekMenu.tsx
//
// The timing control: what this task's row actually says about when it is to
// be done, and the one place to change it.
//
// The trigger WEARS the answer — "Choose when", "Oct 4 – Oct 10 · any day",
// "Tue, Oct 6 · any time" — rather than a verb, so nobody has to open anything
// to find out (connected planning design, 2026-09-24). It reads that answer
// from `taskTiming`, the module every other surface reads, so Month, Season,
// Week, Day and details cannot drift apart.
//
// Every other route to "a week" means the week containing now, so an October
// task could only be committed to a September week (2026-09-24). The weeks
// offered here come from the period in front of you — the month being VIEWED
// on a plan page, the GOAL's own period in goal details — so what you can
// choose matches what you are looking at. "Another week…" reaches any week at
// all, so October work can be prepared earlier (or later).
//
// Choosing a week never assigns a day, never clears the month commitment, and
// never touches the goal link. The task appears on that week's list and stays
// October's.
//
// The listed weeks are the weeks of `periodStart`'s MONTH. A season goal is
// anchored on its first month and reaches the rest through "Another week…";
// listing a season's thirteen weeks would be a menu nobody can read.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { CalendarRange } from 'lucide-react'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'
import { weeksOfMonth } from '@/lib/planning/monthWeeks'
import { readCadenceConfig, localYmd, weekStartAnchor, parseLocalYmd } from '@/lib/cadence/config'
import { timingLabel, timingDescription, removeDayOutcome, removeAllOutcome, hasTiming, type TaskTiming } from '@/lib/planning/taskTiming'
import { densityScale, type DayDensity } from '@/lib/planning/dayDensity'
import { DayDensityTiles, type DayChoice } from './DayDensityTiles'

/** "Oct 4 – 10" for a week anchor, matching the listed weeks' labels. */
function weekLabel(start: Date): string {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  return start.getMonth() === end.getMonth()
    ? `${month(start)} ${start.getDate()} – ${end.getDate()}`
    : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`
}

export function PlanWeekMenu({
  title, periodStart, periodLabel, currentWeekStart, timing, onPickWeek, onClearWeek, onRemoveDay, onPickDay,
  dayChoices, dayChoicesLabel, size = 'md',
}: {
  title: string
  /** Any day inside the period whose weeks should be offered — the month being
   *  viewed, or the goal's own period. */
  periodStart: Date
  /** What "keep it here" means, e.g. "October". Defaults to the month name. */
  periodLabel?: string
  /** The week it is already on, if any — shown as the current choice. */
  currentWeekStart?: Date | null
  /** The task's saved timing, which the trigger states. Omitted only where the
   *  caller genuinely has no task to read (it then falls back to the verb). */
  timing?: TaskTiming
  onPickWeek: (weekStart: Date) => void
  /** Remove the week and any day, keeping the period commitment. Offered only
   *  where the caller has a period to fall back to. */
  onClearWeek?: () => void
  /** Remove the DAY alone. An explicit week commitment survives it; where
   *  there is none, the menu says so rather than promising a week. */
  onRemoveDay?: () => void
  /** "A day…" — a date, which the caller schedules. */
  onPickDay?: (date: Date) => void
  /**
   * Dated days to offer as tiles, with what is already on each — the approved
   * RescheduleGrid language (Scott, 2026-09-24). They are the CALLER's days:
   * on /week, the seven days of the week in view, so a November row offers
   * November days instead of jumping to today.
   *
   * Omitted, the menu is exactly as it was: the date field below is the only
   * way to a day, and it stays either way.
   */
  dayChoices?: readonly { date: Date; label: string; dateLabel: string; density: DayDensity }[]
  /** What the tiles are — "A day in Nov 8 – 14". */
  dayChoicesLabel?: string
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  usePopoverFocus(open, triggerRef, menuRef, close)

  const [otherWeek, setOtherWeek] = useState('')
  const [dayValue, setDayValue] = useState('')
  const weekStartsOn = readCadenceConfig().weekStartsOn
  const weeks = weeksOfMonth(periodStart, weekStartsOn)
  // Two different labels. The list of weeks belongs to `periodStart`'s MONTH
  // (a season is anchored on its first month and reaches the rest through
  // "Another week…"), while "keep it in …" names the period the task actually
  // belongs to — which for a season row is the season, not that month.
  const weeksMonthLabel = periodStart.toLocaleDateString('en-US', { month: 'long' })
  const monthLabel = periodLabel ?? weeksMonthLabel
  const currentKey = currentWeekStart ? localYmd(currentWeekStart) : null
  // Any date picked in "Another week…" snaps to that week's anchor, so the
  // value written is always a real week_start and the reader is told which
  // week the date they typed actually lands in.
  const otherAnchor = otherWeek ? weekStartAnchor(parseLocalYmd(otherWeek), weekStartsOn) : null

  // Portalled and fixed, the way the inbox triage menu is: inside a row, the
  // phone-wide overflow rule clips an absolutely-positioned menu to a sliver.
  const [position, setPosition] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < 300 && above > below
    setPosition({
      right: Math.max(8, window.innerWidth - r.right),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      maxHeight: Math.max(160, (up ? above : below) - 4),
    })
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  // What the trigger says. With no task to read it keeps the old verb, so a
  // caller that has not been converted still renders something sensible.
  const label = timing ? timingLabel(timing) : 'Plan'
  const chosen = !!timing && (!!timing.day || !!timing.week)

  const choose = (fn: () => void) => () => { setOpen(false); fn() }
  const itemClass = 'block w-full rounded-md px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-primary-50 hover:text-primary-700'

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Choose a week or a day for ${title}. ${timing ? timingDescription(timing, monthLabel) : 'No timing shown'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`plan-timing-trigger inline-flex max-w-full items-center gap-1 rounded-md border transition-colors ${
          chosen
            ? 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100'
            : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-700'
        } ${size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-[13px]'} ${open ? 'bg-neutral-100' : ''}`}
      >
        <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <span aria-hidden="true" className="opacity-50">▾</span>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Plan ${title} for a week`}
          style={position}
          className={`fixed z-[60] overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg ${
            dayChoices && dayChoices.length > 0 ? 'w-72' : 'w-56'
          }`}
        >
          <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400" aria-hidden="true">
            A week in {weeksMonthLabel}
          </p>
          {weeks.map((w) => {
            const isCurrent = currentKey === localYmd(w.start)
            return (
              <button
                key={w.label}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                className={`${itemClass} ${isCurrent ? 'font-semibold text-primary-700' : ''}`}
                onClick={choose(() => onPickWeek(w.start))}
              >
                {w.label}
              </button>
            )
          })}
          <div className="my-1 border-t border-neutral-100" />
          <div className="px-3 py-1.5">
            <label className="block text-sm text-neutral-700">
              Another week…
              <input
                type="date"
                value={otherWeek}
                onChange={(e) => setOtherWeek(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1 text-sm"
              />
            </label>
            {otherAnchor && (
              <button
                type="button"
                className="mt-1.5 w-full rounded-md bg-primary-50 px-2 py-1 text-sm font-semibold text-primary-700"
                onClick={choose(() => onPickWeek(otherAnchor))}
              >
                Plan for {weekLabel(otherAnchor)}
              </button>
            )}
          </div>
          {(onClearWeek || onRemoveDay || onPickDay) && <div className="my-1 border-t border-neutral-100" />}
          {/* What a removal leaves behind, said HERE rather than after the
              fact — the consequence is never a surprise (requirement 6). The
              sentences come from taskTiming, so they describe the row's actual
              saved commitments instead of a general promise. */}
          {timing?.day && onRemoveDay && (
            <button type="button" role="menuitem" className={itemClass} onClick={choose(onRemoveDay)}>
              Remove {timing.day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              <span className="block text-xs text-neutral-400">{removeDayOutcome(timing, monthLabel)}</span>
            </button>
          )}
          {onClearWeek && (!timing || hasTiming(timing)) && (
            <button type="button" role="menuitem" className={itemClass} onClick={choose(onClearWeek)}>
              {timing?.day ? 'Remove day and week' : 'Remove week'}
              <span className="block text-xs text-neutral-400">
                {timing ? removeAllOutcome(timing, monthLabel) : `Keeps it in ${monthLabel}; no week yet.`}
              </span>
            </button>
          )}
          {/* The days themselves, when the caller knows which ones to offer.
              The date field stays below as the explicit alternative — any day
              at all, including one outside this week. */}
          {onPickDay && dayChoices && dayChoices.length > 0 && (
            <DayDensityTiles
              days={dayChoices.map((d): DayChoice => ({
                ...d,
                current: !!timing?.day && localYmd(timing.day) === localYmd(d.date),
              }))}
              level={densityScale(dayChoices.map((d) => d.density)).level}
              heading={dayChoicesLabel ?? 'A day'}
              onPick={(date) => { setOpen(false); onPickDay(date) }}
            />
          )}
          {onPickDay && (
            <div className="px-3 py-1.5">
              <label className="block text-sm text-neutral-700">
                {dayChoices && dayChoices.length > 0 ? 'Another day…' : 'A day…'}
                <input
                  type="date"
                  value={dayValue}
                  onChange={(e) => setDayValue(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1 text-sm"
                />
              </label>
              {dayValue && (
                <button
                  type="button"
                  className="mt-1.5 w-full rounded-md bg-primary-50 px-2 py-1 text-sm font-semibold text-primary-700"
                  onClick={choose(() => onPickDay(parseLocalYmd(dayValue)))}
                >
                  Plan for {parseLocalYmd(dayValue).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
