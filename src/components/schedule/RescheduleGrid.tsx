// src/components/schedule/RescheduleGrid.tsx
//
// The When group of the triage contract (lib/triage/contract.ts), drawn as the
// shared 2-column icon grid: Today · Tonight · Tomorrow · This week · Next week
// · This weekend · Next weekend · This month · Next month · This season ·
// Someday · Pick date & time…, each tile naming where it lands ("Tue, Oct 13",
// "Oct 17–23", "November") against the actual today, the household's week
// start and its own seasons. Every triage surface draws When through here, so
// the order and words cannot drift between Today, Inbox, details and Week.
//
// A routine occurrence (`entity="occurrence"`) is always on a day, so a period
// tile asks which day in that period, both weekend days are offered, and the
// two Whens it cannot take (This season, Someday) say why and offer the scoped
// alternative instead of doing nothing.

import { useState } from 'react'
import { Sun, Moon, Sunrise, CalendarDays, CalendarRange, Calendar, CalendarCheck, CalendarClock, CalendarFold, Leaf, Hourglass, CalendarPlus, ChevronLeft } from 'lucide-react'
import { relativeWeekend, weekendLabel, weekendEnd } from '@/lib/planning/weekend'
import type { TriageWhen } from './TriageWhenMenu'
import type { DayLoad } from '@/lib/today/dayLoad'
import { DayLoadBar } from './DayLoadBar'
import { SpecificDatePicker } from './SpecificDatePicker'
import { getBaseDate, getNextWeekend, getWeekendAfterNext, getNextMonday, TIME_PRESETS } from '@/lib/dateHelpers'
import { WHEN_ORDER, WHEN_LABEL, PICK_DATE_LABEL, whenAvailability, unavailableNote, type WhenAvailability } from '@/lib/triage/contract'
import { whenDetail, daysOf, dayLabel, triageClock } from '@/lib/triage/periods'
import { localYmd } from '@/lib/cadence/config'

const ICON: Record<TriageWhen, typeof Sun> = {
  today: Sun,
  tonight: Moon,
  tomorrow: Sunrise,
  'this-week': CalendarCheck,
  'next-week': Calendar,
  'this-weekend': CalendarDays,
  'next-weekend': CalendarRange,
  'this-month': CalendarClock,
  'next-month': CalendarFold,
  'this-season': Leaf,
  someday: Hourglass,
}

const WHENS: { when: TriageWhen; label: string; Icon: typeof Sun }[] = WHEN_ORDER.map((when) => ({ when, label: WHEN_LABEL[when], Icon: ICON[when] }))

// Concrete date each dated `when` resolves to — MUST mirror applyTriageWhen in
// lib/triage/applyWhen.ts so the tile never promises a date the action won't
// honor. Surfacing it kills the "which Saturday is 'next weekend'?" ambiguity at
// the point of choice. Pool whens (this-week/this-month/someday) have no
// specific date and show label only.
const WHEN_DATE: Partial<Record<TriageWhen, () => Date>> = {
  tomorrow: () => getBaseDate(1),
  'this-weekend': getNextWeekend,
  'next-weekend': getWeekendAfterNext,
  'next-week': getNextMonday,
}

/**
 * Both days of the weekend a tile means, in order, or null for anything that
 * is not a weekend.
 *
 * "This weekend" resolving silently to Saturday was Scott's finding on the
 * walkthrough: an event has to land on a specific day, and the picker was
 * choosing which one without asking. Read through `weekendStartFor` /
 * `weekendEnd` — the app's ONE weekend definition, which also counts Sunday
 * as part of the weekend in progress. (There is no per-household weekend
 * setting to honour beyond that; `weekStartsOn` is a different question.)
 */
export function weekendDaysFor(when: TriageWhen): [Date, Date] | null {
  if (when !== 'this-weekend' && when !== 'next-weekend') return null
  const saturday = relativeWeekend(when === 'next-weekend')
  return [saturday, weekendEnd(saturday)]
}

/**
 * The DAY a relative tile means, or null for a pool tile that means no day at
 * all (this-week / this-month / someday).
 *
 * Exported because a caller that acts on `onPick(when)` must land on the same
 * day the tile printed. The event panel does exactly that, and when this was
 * private it had no way to — so its tiles did nothing (Scott, 2026-09-24).
 * Midnight, like every helper here: a caller that must keep a time of day
 * supplies it itself.
 */
export function dateForWhen(when: TriageWhen): Date | null {
  if (when === 'today' || when === 'tonight') return getBaseDate(0)
  return WHEN_DATE[when]?.() ?? null
}

/** Compact tile date, e.g. "Sat Jul 4" — weekday included so weekends read clearly. */
function tileDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const tileClass =
  'flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap ' +
  'text-neutral-700 bg-neutral-50 hover:bg-primary-50 hover:text-primary-700 transition-all duration-150'

interface Props {
  flexibleWeekend?: boolean
  /**
   * Which tiles to offer, from the contract's order. Omitted, the whole When
   * group. A caller that can only act on some (an event cannot be moved to
   * "Someday") names the ones it can honour, rather than showing tiles that
   * quietly do nothing.
   */
  whens?: readonly TriageWhen[]
  /**
   * What is being moved. A task (default) can live in a period pool or
   * Someday. An occurrence must land on a day: periods ask for the day, and
   * Someday / This season explain themselves. An event keeps the dates its
   * panel has always moved it to.
   */
  entity?: 'task' | 'occurrence' | 'event'
  /**
   * Offer BOTH days of a weekend rather than one tile that means Saturday.
   *
   * For a caller that must land on a specific day — an event ends at a
   * particular time, so there is no "either day" for it to use. A task keeps
   * `flexibleWeekend` below, which is the opposite answer to the same
   * question and stays as it was.
   */
  weekendDays?: boolean
  /** `day` is set only for a tile the reader chose a day on (a weekend day,
   *  or a day inside a period for an occurrence). */
  onPick: (when: TriageWhen, day?: Date) => void
  /** When provided, adds a "Pick date & time…" tile for a specific date/time. */
  onPickDate?: (date: Date, isAllDay: boolean) => void
  /**
   * How full each dated tile's day already is, keyed by `loadKeyFor(when)`.
   * Omit for a plain grid — every existing caller renders exactly as before.
   */
  loads?: Map<string, DayLoad>
  /** Tapping a tile's bar opens the day peek instead of scheduling. */
  onPeek?: (date: Date, when: TriageWhen) => void
  /** The day the thing is on now: that day's tile says so and does nothing. */
  currentDay?: Date | null
  /** The scoped alternatives offered when a When cannot apply (an
   *  occurrence's Someday): "Skip this time", "Open routine". */
  alternatives?: { label: string; onSelect: () => void }[]
}

/**
 * Key a `when` into the loads map. `tonight` is scoped to the evening band, so
 * it gets its own key rather than colliding with `today`'s full-day load.
 */
const localKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A specific day's key in the loads map — what a weekend day tile reads. */
export function loadKeyForDay(day: Date): string {
  return localKey(day)
}

export function loadKeyFor(when: TriageWhen): string {
  const dateFn = when === 'today' || when === 'tonight' ? () => getBaseDate(0) : WHEN_DATE[when]
  if (!dateFn) return `pool:${when}`
  const d = dateFn()
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return when === 'tonight' ? `${ymd}|evening` : ymd
}

export function RescheduleGrid({ onPick, onPickDate, loads, onPeek, whens, flexibleWeekend = false, weekendDays = false, entity = 'task', currentDay, alternatives = [] }: Props) {
  const occurrence = entity === 'occurrence'
  const avail: Partial<Record<TriageWhen, WhenAvailability>> = entity === 'occurrence' ? whenAvailability('occurrence') : whenAvailability('task')
  const offered = whens ? WHENS.filter((w) => whens.includes(w.when)) : WHENS
  // A weekend becomes its two days, each an ordinary tile — same look, same
  // load bar, same one tap. Never when the caller can take "either day".
  const expandWeekend = (weekendDays || occurrence) && !flexibleWeekend
  const tiles: Array<(typeof WHENS)[number] & { day?: Date }> = expandWeekend
    ? offered.flatMap((t) => {
      const days = weekendDaysFor(t.when)
      return days ? days.map((day) => ({ ...t, day })) : [t]
    })
    : offered
  const [picking, setPicking] = useState(false)
  const [pickingToday, setPickingToday] = useState(false)
  // An occurrence's period tile: which day in it.
  const [pickingIn, setPickingIn] = useState<TriageWhen | null>(null)
  // A When the thing cannot take: why, and what it can do instead.
  const [explaining, setExplaining] = useState<TriageWhen | null>(null)
  const clock = triageClock()
  const todayYmd = localYmd(clock.now)
  const currentYmd = currentDay ? localYmd(currentDay) : null

  if (picking && onPickDate) {
    return <SpecificDatePicker onSubmit={(date, isAllDay) => onPickDate(date, isAllDay)} onBack={() => setPicking(false)} />
  }

  const back = (onBack: () => void) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onBack() }}
      className="flex items-center gap-1.5 px-1 pb-1 text-[11px] uppercase tracking-wider font-medium text-neutral-400 hover:text-neutral-600"
    >
      <ChevronLeft className="w-3.5 h-3.5" /> Back
    </button>
  )

  if (explaining) {
    return (
      <div className="space-y-2" role="group" aria-label={`${WHEN_LABEL[explaining]} isn’t available`} onClick={(e) => e.stopPropagation()}>
        {back(() => setExplaining(null))}
        <p className="px-1 text-sm text-neutral-600" role="note">{unavailableNote(explaining)}</p>
        <div className="grid grid-cols-1 gap-2">
          {onPickDate && explaining !== 'someday' && (
            <button type="button" role="menuitem" className={tileClass} onClick={(e) => { e.stopPropagation(); setExplaining(null); setPicking(true) }}>
              <CalendarPlus className="w-4 h-4 shrink-0" /><span>{PICK_DATE_LABEL}</span>
            </button>
          )}
          {alternatives.map((alt) => (
            <button key={alt.label} type="button" role="menuitem" className={tileClass} onClick={(e) => { e.stopPropagation(); alt.onSelect() }}>
              <span>{alt.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (pickingIn) {
    const days = daysOf(pickingIn, clock)
    const lead = (days[0]?.getDay() ?? 0)
    return (
      <div className="space-y-2" role="group" aria-label={`Which day ${WHEN_LABEL[pickingIn].toLowerCase()}?`} onClick={(e) => e.stopPropagation()}>
        {back(() => setPickingIn(null))}
        <div className="px-1 text-[11px] uppercase tracking-wider text-neutral-400">
          {WHEN_LABEL[pickingIn]} · {whenDetail(pickingIn, clock)} — which day?
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.length > 7 && Array.from({ length: lead }, (_, i) => <span key={`pad-${i}`} aria-hidden="true" />)}
          {days.map((d) => {
            const ymd = localYmd(d)
            const past = ymd < todayYmd
            const here = ymd === currentYmd
            return (
              <button
                key={ymd}
                type="button"
                role="menuitem"
                disabled={past || here}
                aria-label={`${dayLabel(d)}${here ? ' (it’s on this day)' : ''}`}
                onClick={(e) => { e.stopPropagation(); onPick(pickingIn, d) }}
                className={`flex flex-col items-center rounded-lg px-1 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${ymd === todayYmd ? 'bg-primary-50 text-primary-700' : 'bg-neutral-50 text-neutral-700'} hover:bg-primary-50 hover:text-primary-700`}
              >
                <span className="text-[10px] text-neutral-400">{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                <span>{d.getDate()}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // "Today" fans out to a time step (when the host wired onPickDate) so a task can
  // land at a specific hour today, not only all-day. All-day stays one tap away
  // via the prominent button, preserving the fast path.
  if (pickingToday && onPickDate) {
    const base = getBaseDate(0)
    const at = (hour: number, minute = 0) => {
      const d = getBaseDate(0)
      d.setHours(hour, minute, 0, 0)
      onPickDate(d, false)
    }
    return (
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPickingToday(false) }}
          className="flex items-center gap-1.5 px-1 pb-1 text-[11px] uppercase tracking-wider font-medium text-neutral-400 hover:text-neutral-600"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="px-1 text-[11px] uppercase tracking-wider text-neutral-400">Today · {tileDate(base)}</div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPickDate(base, true) }}
          className={`${tileClass} w-full justify-center`}
        >
          All day
        </button>
        <div className="max-h-64 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            {TIME_PRESETS.map(({ label, hour }) => (
              <button
                key={hour}
                type="button"
                onClick={(e) => { e.stopPropagation(); at(hour) }}
                className={`${tileClass} justify-center`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <input
          type="time"
          aria-label="Other time today"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return
            const [hh, mm] = v.split(':').map(Number)
            at(hh, mm)
          }}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map(({ when, label, Icon, day }) => {
        const a = avail[when] ?? 'direct'
        const isWeekendWhen = when === 'this-weekend' || when === 'next-weekend'
        // A task's weekend is either day (weekendPlacement), whether or not
        // the caller asked: that is what applyTriageWhen writes for it.
        const weekend = isWeekendWhen && !day && entity === 'task'
        // An event keeps the dates its panel moves it to (next week = Monday).
        const legacy = entity === 'event' ? WHEN_DATE[when] : undefined
        const sub = day ? tileDate(day)
          : weekend ? weekendLabel(relativeWeekend(when === 'next-weekend')).replace('Weekend · ', '')
            : legacy ? tileDate(legacy())
              : a === 'unavailable' ? 'Not for one time'
                : when === 'today' || when === 'tomorrow' ? tileDate(dateForWhen(when)!)
                  : whenDetail(when, clock)
        const tileDay = day ?? (when === 'today' || when === 'tonight' || when === 'tomorrow' ? dateForWhen(when) : null)
        // Already on that day: the tile says so rather than "moving" it there.
        // (Today still opens its time step when the host takes a time.)
        const here = !!tileDay && !!currentYmd && localYmd(tileDay) === currentYmd && when !== 'tonight' && !(when === 'today' && onPickDate)
        // Only a tile that is ONE day carries that day's bar.
        const load = tileDay ? loads?.get(day ? loadKeyForDay(day) : loadKeyFor(when)) : undefined
        return (
          <div key={day ? `${when}-${localKey(day)}` : when} data-tile className="flex flex-col">
            <button
              type="button"
              role="menuitem"
              aria-disabled={here || undefined}
              onClick={(e) => {
                e.stopPropagation()
                if (here) return
                if (a === 'unavailable') { setExplaining(when); return }
                if (a === 'pick-day' && !day) { setPickingIn(when); return }
                // Today opens the time step when the host can take a specific
                // time; otherwise it stays an instant all-day pick.
                if (when === 'today' && onPickDate) setPickingToday(true)
                // The day is passed ONLY when the reader chose one, so every
                // existing caller sees the call it always saw.
                else if (day) onPick(when, day)
                else onPick(when)
              }}
              className={`${tileClass}${a === 'unavailable' || here ? ' opacity-60' : ''}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex flex-col leading-tight min-w-0">
                <span>{label}</span>
                {sub && <span className="text-[11px] font-normal text-neutral-400">{here ? 'It’s on this day' : sub}</span>}
                {/* Its own line: on one line with the dates it ran past the
                    tile's edge in the side panel (walkthrough, 2026-09-25). */}
                {weekend && <span className="text-[11px] font-normal text-neutral-400">either day</span>}
                {a === 'pick-day' && !day && <span className="text-[11px] font-normal text-neutral-400">choose a day</span>}
              </span>
            </button>
            {load && (
              <div className="px-2.5">
                <DayLoadBar load={load} onPeek={onPeek ? () => onPeek(load.date, when) : undefined} />
              </div>
            )}
          </div>
        )
      })}
      {onPickDate && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => { e.stopPropagation(); setPicking(true) }}
          className={`${tileClass} col-span-2`}
        >
          <CalendarPlus className="w-4 h-4 shrink-0" />
          <span>{PICK_DATE_LABEL}</span>
        </button>
      )}
    </div>
  )
}
