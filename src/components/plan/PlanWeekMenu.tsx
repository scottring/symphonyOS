// src/components/plan/PlanWeekMenu.tsx
//
// "Plan ▾" on a task that belongs to a period: which WEEK should it sit on,
// with no day attached.
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
  title, periodStart, periodLabel, currentWeekStart, onPickWeek, onClearWeek, onPickDay, size = 'md',
}: {
  title: string
  /** Any day inside the period whose weeks should be offered — the month being
   *  viewed, or the goal's own period. */
  periodStart: Date
  /** What "keep it here" means, e.g. "October". Defaults to the month name. */
  periodLabel?: string
  /** The week it is already on, if any — shown as the current choice. */
  currentWeekStart?: Date | null
  onPickWeek: (weekStart: Date) => void
  /** "Keep it in <Month>" — drops the week, keeps the period commitment. */
  onClearWeek?: () => void
  /** "A day…" — a date, which the caller schedules. */
  onPickDay?: (date: Date) => void
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
  const monthLabel = periodLabel ?? periodStart.toLocaleDateString('en-US', { month: 'long' })
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

  const choose = (fn: () => void) => () => { setOpen(false); fn() }
  const itemClass = 'block w-full rounded-md px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-primary-50 hover:text-primary-700'

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Plan ${title} for a week`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 ${
          size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-[13px]'
        } ${open ? 'bg-neutral-100' : ''}`}
      >
        <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Plan</span>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Plan ${title} for a week`}
          style={position}
          className="fixed z-[60] w-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400" aria-hidden="true">
            A week in {monthLabel}
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
          {(onClearWeek || onPickDay) && <div className="my-1 border-t border-neutral-100" />}
          {onClearWeek && (
            <button type="button" role="menuitem" className={itemClass} onClick={choose(onClearWeek)}>
              Keep it in {monthLabel}
              <span className="block text-xs text-neutral-400">no week yet</span>
            </button>
          )}
          {onPickDay && (
            <div className="px-3 py-1.5">
              <label className="block text-sm text-neutral-700">
                A day…
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
