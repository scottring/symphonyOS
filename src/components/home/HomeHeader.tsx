import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
    onPrev = () => onWeekChange(addDays(weekStart, -rangeDays))
    onNext = () => onWeekChange(addDays(weekStart, rangeDays))
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
  const PRESETS: { label: string; pick: () => Date[] }[] = [
    { label: 'This week', pick: () => weekRange(new Date(), readCadenceConfig().weekStartsOn) },
    { label: 'Today', pick: () => presetRange('today' as RangePreset, new Date()) },
    { label: 'Weekend', pick: () => presetRange('weekend', new Date()) },
    { label: '3 days', pick: () => presetRange('three', new Date()) },
  ]
  const rangeControl = currentView === 'week' && onRangeChange ? (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Days on screen">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => { setCustomOpen(false); onRangeChange(p.pick()) }}
          className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors"
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={customOpen}
        onClick={() => setCustomOpen((v) => !v)}
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
                onRangeChange(buildRange(weekStart, new Date(e.target.value + 'T00:00:00')))
              }}
              className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-700"
            />
          </label>
        </span>
      )}
    </div>
  ) : null

  // /week wears the same card Today does: the run of days in the eyebrow
  // ("Week", "3 days"), the dates as the serif title, the range presets on
  // the quiet line, chrome in the corner (Scott, 2026-09-06: the day bar is
  // the anchor; bring its shape to every planning page).
  if (currentView === 'week') {
    const eyebrowLabel = rangeDays === 7 ? 'Week' : rangeDays === 1 ? 'Day' : `${rangeDays} days`
    return (
      <MastheadCard
        eyebrow={<PeriodNavEyebrow label={eyebrowLabel} onPrev={onPrev} onNext={onNext} prevLabel={prevLabel} nextLabel={nextLabel} />}
        title={label.long}
        subline={rangeControl}
        controls={<HomeChromeControls className="flex" />}
      />
    )
  }

  return (
    <header className="mb-6 px-3 md:px-0">
      {/* Wraps rather than competing for one line. Every part of the date
          cluster is shrink-0 except the <h1> itself, and this right-hand group
          is shrink-0 too — so when the detail panel narrows the column, the
          title was the only thing that could give and "August 7, 2026"
          collapsed to "Au…". The controls drop to their own line instead. */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4">
        <div className="flex items-center gap-2 min-w-0 justify-center md:justify-start">
            <button
              aria-label={prevLabel}
              onClick={onPrev}
              className="p-1.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="font-display text-2xl md:text-[32px] leading-tight text-neutral-900 min-w-0 text-center md:text-left">
              <span className="md:hidden">{label.short}</span>
              <span className="hidden md:inline">{label.long}</span>
            </h1>
            <button
              aria-label={nextLabel}
              onClick={onNext}
              className="p-1.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
        </div>

      {/* D/W/M switcher, "Plan the week", and the horizon explainer left with
          the 2026-08 analog-planning pivot — the masthead keeps only the
          domain chooser and the assistant toggle. */}
      <HomeChromeControls className="hidden md:flex md:shrink-0 md:pb-1" />
      </div>

      {/* Hairline rule anchors the masthead and separates it from the content
          below. Today's day card draws its own border, so it doesn't need one. */}
      <div className="hidden md:block mt-4 h-px bg-gradient-to-r from-neutral-200 to-transparent" />
    </header>
  )
}
