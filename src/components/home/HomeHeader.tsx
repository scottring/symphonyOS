import { useEffect, useRef, useState } from 'react'

import type { HomeViewType } from '@/types/homeView'
import { HomeChromeControls } from './HomeChromeControls'
import { mondayOfWeek } from '@/lib/workweekHelpers'
import { buildRange, presetRange, weekRange, type RangePreset } from '@/lib/planning/dateRange'
import { readCadenceConfig } from '@/lib/cadence/config'
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'

interface HomeHeaderProps {
  currentView: HomeViewType
  onViewChange: (v: HomeViewType) => void

  /** For currentView === 'today' */
  viewedDate: Date
  onDateChange: (d: Date) => void

  /** For currentView === 'week' | 'workweek'. On /week this is the first day
   *  ON SCREEN — a range start — not necessarily the week's anchor. */
  weekStart: Date
  onWeekChange: (d: Date) => void
  /** How many days /week draws from `weekStart` (1–7). A range is a VIEW of
   *  the calendar, never a bucket: picking one changes what is drawn and
   *  writes nothing. Default 7. */
  rangeDays?: number
  /** A preset or a custom start/end, handed over as the whole run of days. */
  onRangeChange?: (range: Date[]) => void

  /** For currentView === 'month' */
  monthStart: Date
  onMonthChange: (d: Date) => void
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d); n.setDate(n.getDate() + days); return n
}

function addMonths(d: Date, months: number): Date {
  const n = new Date(d); n.setMonth(n.getMonth() + months); return n
}

function formatDayShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function HomeHeader(props: HomeHeaderProps) {
  const { currentView, viewedDate, onDateChange, weekStart, onWeekChange, rangeDays = 7, onRangeChange, monthStart, onMonthChange } = props
  const [customOpen, setCustomOpen] = useState(false)
  // Which preset (if any) produced the range currently on screen — a plain
  // day-count can't tell "Weekend" (2 days) apart from a custom 2-day range,
  // so the eyebrow needs to know WHICH button was pressed, not just how many
  // columns came back. Cleared the moment the range on screen no longer
  // matches what that preset produced (chevron nav, a custom edit, or any
  // other caller of onWeekChange/onRangeChange) so a stale "Weekend" label
  // never survives past the range it named.
  const [activePreset, setActivePreset] = useState<RangePreset | 'thisWeek' | null>(null)
  const activePresetRangeRef = useRef<{ start: number; days: number } | null>(null)
  useEffect(() => {
    if (!activePresetRangeRef.current) return
    const stillMatches =
      activePresetRangeRef.current.start === weekStart.getTime() &&
      activePresetRangeRef.current.days === rangeDays
    if (!stillMatches) {
      activePresetRangeRef.current = null
      setActivePreset(null)
    }
  }, [weekStart, rangeDays])

  // Per-view label + chevron handlers
  let label: { short: string; long: string }
  let onPrev: () => void
  let onNext: () => void
  let prevLabel: string
  let nextLabel: string

  if (currentView === 'today') {
    label = {
      short: viewedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      long: viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    }
    onPrev = () => onDateChange(addDays(viewedDate, -1))
    onNext = () => onDateChange(addDays(viewedDate, 1))
    prevLabel = 'Previous day'
    nextLabel = 'Next day'
  } else if (currentView === 'workweek') {
    // Workweek: render Monday-anchored 5-day range. Step by 7 days to stay
    // Sunday-anchored at the state layer (HomeView's onWeekChange normalizes).
    const mondayStart = mondayOfWeek(weekStart)
    const fri = addDays(mondayStart, 4)
    const shortStr = `${formatDayShort(mondayStart)} – ${formatDayShort(fri)}`
    label = { short: shortStr, long: shortStr }
    onPrev = () => onWeekChange(addDays(weekStart, -7))
    onNext = () => onWeekChange(addDays(weekStart, 7))
    prevLabel = 'Previous week'
    nextLabel = 'Next week'
  } else if (currentView === 'week') {
    // The masthead names the days on screen and steps by that many, so a
    // weekend steps to the next weekend-sized run, a week to the next week.
    const lastDay = addDays(weekStart, rangeDays - 1)
    const shortStr = rangeDays === 1
      ? weekStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : `${formatDayShort(weekStart)} – ${formatDayShort(lastDay)}`
    label = { short: shortStr, long: shortStr }
    onPrev = () => { activePresetRangeRef.current = null; setActivePreset(null); onWeekChange(addDays(weekStart, -rangeDays)) }
    onNext = () => { activePresetRangeRef.current = null; setActivePreset(null); onWeekChange(addDays(weekStart, rangeDays)) }
    prevLabel = rangeDays === 7 ? 'Previous week' : 'Earlier'
    nextLabel = rangeDays === 7 ? 'Next week' : 'Later'
  } else {
    // month
    const shortStr = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    label = { short: shortStr, long: shortStr }
    onPrev = () => onMonthChange(addMonths(monthStart, -1))
    onNext = () => onMonthChange(addMonths(monthStart, 1))
    prevLabel = 'Previous month'
    nextLabel = 'Next month'
  }

  // Today draws its own masthead inside the day card: the date nav, and the
  // domain/assistant controls in its top-right corner. Rendering a header
  // above it just put a second empty band on the page.
  if (currentView === 'today') return null

  // /week's range control. "This week" is the calendar week (the week list's
  // week); the others come from the same presets the time-block grid had, so
  // nothing was lost when that overlay went. Custom shows a start and an end;
  // a new start slides the run along, a new end resizes it.
  const rangeEnd = addDays(weekStart, rangeDays - 1)
  const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const PRESETS: { key: RangePreset | 'thisWeek'; label: string; pick: () => Date[] }[] = [
    { key: 'thisWeek', label: 'This week', pick: () => weekRange(new Date(), readCadenceConfig().weekStartsOn) },
    { key: 'today', label: 'Today', pick: () => presetRange('today' as RangePreset, new Date()) },
    { key: 'weekend', label: 'Weekend', pick: () => presetRange('weekend', new Date()) },
    { key: 'three', label: '3 days', pick: () => presetRange('three', new Date()) },
  ]
  const rangeControl = currentView === 'week' && onRangeChange ? (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Days on screen">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => {
            setCustomOpen(false)
            const range = p.pick()
            activePresetRangeRef.current = range.length > 0 ? { start: range[0].getTime(), days: range.length } : null
            setActivePreset(p.key)
            onRangeChange(range)
          }}
          className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors"
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={customOpen}
        onClick={() => { activePresetRangeRef.current = null; setActivePreset(null); setCustomOpen((v) => !v) }}
        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${customOpen ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'}`}
      >
        Custom
      </button>
      {customOpen && (
        <span className="ml-1 inline-flex items-center gap-1 text-xs text-neutral-500">
          <label className="inline-flex items-center gap-1">
            <span className="sr-only">Start</span>
            <input
              type="date"
              aria-label="Start"
              value={toInput(weekStart)}
              onChange={(e) => {
                if (!e.target.value) return
                const start = new Date(e.target.value + 'T00:00:00')
                activePresetRangeRef.current = null
                setActivePreset(null)
                onRangeChange(buildRange(start, addDays(start, rangeDays - 1)))
              }}
              className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-700"
            />
          </label>
          <span aria-hidden>–</span>
          <label className="inline-flex items-center gap-1">
            <span className="sr-only">End</span>
            <input
              type="date"
              aria-label="End"
              value={toInput(rangeEnd)}
              onChange={(e) => {
                if (!e.target.value) return
                activePresetRangeRef.current = null
                setActivePreset(null)
                onRangeChange(buildRange(weekStart, new Date(e.target.value + 'T00:00:00')))
              }}
              className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-700"
            />
          </label>
        </span>
      )}
    </div>
  ) : null

  // /week wears the same OPEN masthead Today does (parity pass 2026-09-17):
  // the run of days in the eyebrow ("Week", "3 days"), the dates as the serif
  // title, the range presets on the quiet line, chrome in the corner. No date
  // numeral — a range of days has no single one.
  if (currentView === 'week') {
    const eyebrowLabel =
      activePreset === 'weekend' ? 'Weekend'
      : rangeDays === 7 ? 'Week'
      : rangeDays === 1 ? 'Day'
      : `${rangeDays} days`
    return (
      <MastheadCard
        variant="page"
        eyebrow={<PeriodNavEyebrow label={eyebrowLabel} onPrev={onPrev} onNext={onNext} prevLabel={prevLabel} nextLabel={nextLabel} />}
        title={label.long}
        subline={rangeControl}
        controls={<HomeChromeControls className="flex" />}
      />
    )
  }

  return (
    <MastheadCard
      variant="page"
      eyebrow={<PeriodNavEyebrow label={currentView === 'workweek' ? 'Workweek' : 'Month'} onPrev={onPrev} onNext={onNext} prevLabel={prevLabel} nextLabel={nextLabel} />}
      title={(
        <>
          <span className="md:hidden">{label.short}</span>
          <span className="hidden md:inline">{label.long}</span>
        </>
      )}
      controls={<HomeChromeControls className="flex" />}
    />
  )
}
