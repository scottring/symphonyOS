import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import type { HomeViewType } from '@/types/homeView'
import { HomeChromeControls } from './HomeChromeControls'
import { mondayOfWeek } from '@/lib/workweekHelpers'
import { buildRange, presetRange, weekRange, type RangePreset } from '@/lib/planning/dateRange'
import { readCadenceConfig } from '@/lib/cadence/config'
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'
import { ShelvesButton } from '@/components/reference/ShelvesButton'
import { planV2Enabled } from '@/lib/planning/v2/planV2'

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
  /** A token that changes each time the navigation's "Custom range…" is
   *  chosen; a new value opens the custom start/end inputs. */
  customRangeRequest?: string
  /** A preset or a custom start/end, handed over as the whole run of days. */
  onRangeChange?: (range: Date[]) => void

  /** Journal | Schedule on /week — presentation only; drawn beside the dates. */

  /** For currentView === 'month' */
  monthStart: Date
  onMonthChange: (d: Date) => void

  /** Desktop, planning v2, /week: where the week's control row folds into
   *  this masthead (layout system, 2026-10-01). WeekV2 owns the plan's
   *  status and controls and portals them into these two hosts. */
  planSlots?: { subline: (el: HTMLElement | null) => void; controls: (el: HTMLElement | null) => void }
}

/** An empty element whose node goes to `onHost` — where WeekV2 portals the
 *  week's folded status and controls. */
function SlotHost({ onHost, className }: { onHost: (el: HTMLElement | null) => void; className?: string }) {
  return <div ref={onHost} className={className} />
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
  const { currentView, viewedDate, onDateChange, weekStart, onWeekChange, rangeDays = 7, onRangeChange, customRangeRequest, monthStart, onMonthChange } = props
  const [customOpen, setCustomOpen] = useState(!!customRangeRequest)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [menuOpen])
  // Arriving from the navigation's "Custom range…" opens the inputs (state
  // adjusted during render, React's pattern for following a prop); picking a
  // preset afterwards closes them again.
  const [seenCustomRequest, setSeenCustomRequest] = useState(customRangeRequest)
  if (customRangeRequest !== seenCustomRequest) {
    setSeenCustomRequest(customRangeRequest)
    if (customRangeRequest) setCustomOpen(true)
  }
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
      // "Oct 5 – 11": the month once when both ends share it (approved week
      // composition, 2026-10-10).
      : lastDay.getMonth() === weekStart.getMonth()
        ? `${formatDayShort(weekStart)} – ${lastDay.getDate()}`
        : `${formatDayShort(weekStart)} – ${formatDayShort(lastDay)}`
    label = { short: shortStr, long: shortStr }
    onPrev = () => { onWeekChange(addDays(weekStart, -rangeDays)) }
    onNext = () => { onWeekChange(addDays(weekStart, rangeDays)) }
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

  // /week's range menu. The week is always the default; the shorter runs are
  // a choice you make from the eyebrow, not a row of buttons standing under
  // the dates (Scott, 2026-09-19). "This week" is the calendar week (the week
  // list's week). Custom shows a start and an end; a new start slides the run
  // along, a new end resizes it.
  const rangeEnd = addDays(weekStart, rangeDays - 1)
  const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const PRESETS: { key: RangePreset | 'thisWeek'; label: string; pick: () => Date[] }[] = [
    { key: 'thisWeek', label: 'This week', pick: () => weekRange(new Date(), readCadenceConfig().weekStartsOn) },
    { key: 'weekend', label: 'Weekend', pick: () => presetRange('weekend', new Date()) },
    { key: 'three', label: '3 days', pick: () => presetRange('three', new Date()) },
  ]
  const showCustom = customOpen

  if (currentView === 'week') {
    // A shorter run is named by what is on screen, not by which button
    // produced it: a Sat–Sun run is a weekend however you got there, and
    // stepping it along to Mon–Tue makes it "2 days" with nothing to remember
    // or clear. A whole week needs no name: the dates say it.
    const runLabel =
      rangeDays === 7 ? null
      : rangeDays === 1 ? 'Day'
      : rangeDays === 2 && weekStart.getDay() === 6 ? 'Weekend'
      : `${rangeDays} days`
    const closeMenu = (refocus: boolean) => {
      setMenuOpen(false)
      if (refocus) menuButtonRef.current?.focus()
    }
    // Calm pass 2 (approved mockup 2026-10-18): the title row is
    // "‹ Oct 17 – 23 ›", no WEEK eyebrow. The dates themselves open the range
    // menu, so the shorter runs stay one tap away.
    const runName = runLabel && <span className="daybook-title-run">{runLabel}</span>
    const titleNode = onRangeChange ? (
      <button
        ref={menuButtonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls="week-range-menu"
        onClick={() => setMenuOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setMenuOpen(true) } }}
        className="daybook-title-trigger"
      >
        {label.long}
        <ChevronDown className="daybook-title-caret" aria-hidden="true" />
      </button>
    ) : label.long
    // Rendered beside the label rather than inside it: the label slot
    // truncates (overflow hidden), which would clip a popover hung inside it.
    const menu = menuOpen && onRangeChange ? (
      <div
        id="week-range-menu"
        role="menu"
        aria-label="Days on screen"
        ref={menuRef}
        // Safari does not focus a pressed button: without this the press
        // blurs to the page and onBlur closes the menu before the click.
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return }
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
          e.preventDefault()
          const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
          const at = items.indexOf(document.activeElement as HTMLElement)
          const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
          items[next]?.focus()
        }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && e.relatedTarget !== menuButtonRef.current) setMenuOpen(false) }}
        className="absolute left-0 top-full z-30 mt-1 flex min-w-40 flex-col rounded-md outline-none border border-neutral-200 bg-bg-elevated py-1 font-sans shadow-lg"
      >
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="menuitem"
            onClick={() => {
              setCustomOpen(false)
              closeMenu(true)
              onRangeChange(p.pick())
            }}
            className="px-3 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          onClick={() => { setCustomOpen(true); closeMenu(false) }}
          className="px-3 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none"
        >
          Custom range…
        </button>
      </div>
    ) : null
    const customInputs = showCustom && onRangeChange ? (
      <span className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
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
        <span aria-hidden>–</span>
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
      </span>
    ) : null
    // Folded (desktop, v2): the week's fact line under the dates, and the
    // week's own controls (Plan this week, ⋯) at the right.
    const slots = planV2Enabled() ? props.planSlots : undefined
    return (
      <MastheadCard
        variant="page"
        // The run's name sits after the arrows, outside the heading: the
        // heading is the dates.
        titleNav={{ onPrev, onNext, prevLabel, nextLabel, trailing: <>{runName}{menu}</> }}
        title={titleNode}
        // v2: the ? and ▷ live in the week's ⋯ menu (WeekV2).
        help={!planV2Enabled()}
        // Shelves beside the dates, not on a row of its own (2026-09-23).
        // v2: no Shelves here — what they held is in the month column.
        action={slots || planV2Enabled() ? undefined : <ShelvesButton weekPage={weekStart} />}
        subline={slots ? <>{customInputs}<SlotHost onHost={slots.subline} className="pv2-mslot" /></> : customInputs}
        // v2: the page's controls live in the week's control row (WeekV2).
        controls={slots
          ? <div className="pv2-mcontrols"><SlotHost onHost={slots.controls} className="contents" /></div>
          : planV2Enabled() ? undefined : <HomeChromeControls className="flex" />}
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
      // v2 Workweek draws WeekV2, whose ⋯ menu holds the ? and ▷.
      help={!(currentView === 'workweek' && planV2Enabled())}
    />
  )
}
