//
// /week as a journal page (Scott, 2026-09-19, from his paper weekly): seven
// HORIZONTAL day sections stacked down the page, a small date in the margin,
// entries flowing across the full width with a checkbox and, when there is
// one, a small time. Generous width instead of seven narrow columns. Month
// shows what's coming, Week distributes commitments, Today is where you work
// through them.
//
// What a day row holds, in reading order:
//   all-day notes    a holiday, "no school" — italic, no checkbox
//   entries          timed events, tasks and routines, then the untimed work
//                    given to the day (dated or chosen), each with a checkbox
// Unchosen routine occurrences are offered in the planning sidebar.
//   dinner           the day's meal, quietly
// Multi-day context (on call, a trip, a break) is listed once above the days.
//
// Each day row is ONE drop target: dnd-kit's all-day protocol for rows from the
// week's own list ({kind:'allDay', dayIso} → useWeekDragDrop, past-day refusal
// and undo included) and a native drop for rows dragged out of the Today pin.
import { createElement, useState, type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { isMissedPlacement } from '@/lib/week/missedPlacement'
import { journalTime, type ContextSpan } from '@/lib/week/journalSpread'
import { planDropHandlers, type PlanDragPayload } from '@/lib/planning/planDrag'
import { WeekRow } from '@/components/plan/v2/WeekRow'
import { WeekStrip, WeekShape } from './WeekViews'
import type { FamilyMember } from '@/types/family'
import type { DayForecast } from '@/hooks/useWeather'
import { weatherCondition, weatherIcon } from '@/lib/weatherIcon'
import { weekRhythm } from '@/lib/week/weekRhythm'
import { busyBlocks, freeWindows, formatFree } from '@/lib/week/dayShape'

import type { JournalDay, JournalEntry, JournalWeekend } from '@/lib/week/journalDays'
export type { JournalDay, JournalEntry, JournalWeekend } from '@/lib/week/journalDays'

interface WeekJournalProps {
  days: JournalDay[]
  /** The weekend in this week and its "Sometime this weekend" work. */
  weekend?: JournalWeekend | null
  spans: ContextSpan[]
  onSelectItem: (id: string) => void
  onToggleEntry: (entry: JournalEntry, day: JournalDay) => void
  /** A row dragged out of the Today pin, dropped on a day. */
  onPlanDrop?: (day: JournalDay, payload: PlanDragPayload) => void
  /** "+ Add" on a day: a task straight onto that day. Omitted = no control.
   *  (Walkthrough 2026-09-20: "there's no way in the UI to add a task
   *  straight to a day on week" — only ⌘K-with-a-date and the hourly grid.) */
  onAddToDay?: (day: JournalDay, title: string, time?: string) => void
  /** "Can't move": a calendar event on that day at that time (HH:MM). Omitted
   *  (no calendar connected) = nothing to add there. */
  onAddEvent?: (day: JournalDay, title: string, time: string) => void
  /** Rows can be picked up. Off on touch-width layouts, where a drag handle
   *  would swallow the scroll. */
  dragEnabled?: boolean
  /** Narrow screens: the margin tightens; the layout is the same. */
  narrow?: boolean
  /** 'grid' (desktop Week, 2026-10-03): the weekend as one band, the
   *  weekdays across; 'rows' (default): one day under another. */
  layout?: 'rows' | 'grid'
  /** What a planning step needs (grid; Scott, 2026-10-03 — planning in
   *  steps): 'fixed' shows only what can't move (notes, events, timed work);
   *  routinesOpen opens every day's routine fold; readOnly is the finished
   *  plan — nothing moves, nothing is added. */
  show?: 'all' | 'fixed'
  routinesOpen?: boolean
  readOnly?: boolean
  /** A compact view for planning in steps: the week beside a step, or the
   *  finished week's shape (WeekViews). */
  variant?: 'strip' | 'shape'
  /** The shape's person: their things in full, others' faded. */
  person?: string
  /** The household: who carries each row is drawn on it. */
  members?: FamilyMember[]
  /** Show every-day and every-weekday routines in the days (hidden by
   *  default: the same every week, ticked on Today — Scott, 2026-10-04). */
  dailyRoutines?: boolean
  /** "for October: Plan Thanksgiving" — the month line a task was written for. */
  forLabel?: (task: Task) => string | null
  /** The month line as a control for a week item (Week page); null = none.
   *  Drawn instead of the forLabel words when it returns something. */
  forControl?: (task: Task) => ReactNode
  /**
   * The same in-place timing control the week's list and the period pages
   * wear, supplied by the host. Without it a task that moved out of "Any day"
   * onto a day lost the one control that says when it is to be done — the
   * answer was visible right up until the moment it was decided (Codex live
   * test, 2026-09-24).
   *
   * Task entries only. An event or a routine occurrence is not placed this
   * way, and the hourly Schedule grid keeps its own drag interactions —
   * nothing here touches them.
   */
  timingControl?: (task: Task) => ReactNode
  /** The forecast by local YYYY-MM-DD: a day that has one wears a small
   *  sky and high under its weekday. Past days have none. */
  forecast?: Record<string, DayForecast>
}

const eventId = (ev: CalendarEvent) => `event-${ev.google_event_id || ev.id}`

/** "Mon Sep 28" from a local YYYY-MM-DD — parsed by parts, since `new
 *  Date('2026-09-28')` reads as UTC midnight and lands a day early in the US. */
function spanDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function isToday(d: Date): boolean {
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function Entry({ entry, day, onSelect, onToggle, dragEnabled, timingControl, dense = false, fromSometime = false, memberById, forLabel, forControl }: {
  memberById?: Map<string, FamilyMember>
  forLabel?: WeekJournalProps['forLabel']
  forControl?: WeekJournalProps['forControl']
  entry: JournalEntry
  day: JournalDay
  onSelect: (id: string) => void
  onToggle: (entry: JournalEntry, day: JournalDay) => void
  dragEnabled: boolean
  timingControl?: WeekJournalProps['timingControl']
  dense?: boolean
  /** Drawn in "Sometime this weekend": a drop onto its own day still counts. */
  fromSometime?: boolean
}) {
  // One drag rule (Scott, 2026-10-03): a task moves to another day — a timed
  // one keeping its time — and a routine moves as that one occurrence. An
  // event never moves; a done row stays where it was done.
  const drag = !dragEnabled || entry.completed || entry.kind === 'event' ? null
    : entry.kind === 'task' && entry.task ? { id: `journal:${entry.task.id}`, data: { kind: 'chip', taskId: entry.task.id, ...(entry.time ? { keepTime: true } : {}) } }
    : entry.kind === 'routine' && entry.routineId ? { id: `occ:${entry.routineId}:${day.key}`, data: { kind: 'routineOcc', routineId: entry.routineId, fromIso: day.key, title: entry.title, ...(fromSometime ? { fromSometime: true } : {}) } }
    : null
  // Its day passed without a tick — the live copy is back on the list; what
  // stays here is the record, faded.
  const missed = entry.task && !entry.time ? isMissedPlacement(entry.task.scheduledFor, entry.task.completed, new Date()) : false
  return (
    <WeekRow
      mark={entry.kind}
      title={entry.title}
      lane={entry.time ? journalTime(entry.time) : ''}
      completed={entry.completed}
      people={memberById ? (entry.people ?? []).flatMap((id) => { const m = memberById.get(id); return m ? [m] : [] }) : undefined}
      onToggle={entry.kind === 'event' ? undefined : () => onToggle(entry, day)}
      onOpen={() => onSelect(entry.id)}
      meta={(() => {
        const f = entry.task && forLabel ? forLabel(entry.task) : null
        const control = entry.task && forControl ? forControl(entry.task) : null
        // In a day's narrow cell the month line is one line, cut short; its
        // full words stay in the label and on hover (2026-10-08).
        return entry.subtitle || f || control ? <>
          {entry.subtitle && <span className="journal-entry-sub">{entry.subtitle}</span>}
          {control ?? (f && <span className="wk-for is-compact" title={f}><span aria-hidden="true">↳ </span>{f}</span>)}
        </> : undefined
      })()}
      trailing={timingControl && entry.task && !entry.completed ? <span className="journal-entry-when">{timingControl(entry.task)}</span> : undefined}
      drag={drag}
      dense={dense}
      rowProps={{ className: missed ? 'is-missed' : undefined, title: missed ? `${entry.title} — didn't happen` : undefined }}
    />
  )
}

function AddToDay({ day, onAdd, withTime = false, event = false }: { day: JournalDay; onAdd: NonNullable<WeekJournalProps['onAddToDay']>; withTime?: boolean; event?: boolean }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [time, setTime] = useState('')
  const weekday = day.date.toLocaleDateString('en-US', { weekday: 'long' })
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={event ? `Add an event to ${weekday}` : `Add to ${weekday}`}
        className="mt-1 inline-flex items-center gap-1 self-start text-[12.5px] text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 group-hover/day:opacity-100">
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />Add
      </button>
    )
  }
  return (
    <form
      className="mt-1 flex items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (!t) return; if (withTime && time) onAdd(day, t, time); else onAdd(day, t); setDraft(''); setTime(''); setOpen(false) }}
    >
      <input
        autoFocus
        aria-label={event ? `New event on ${weekday}` : `New task for ${weekday}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(''); setOpen(false) } }}
        onBlur={(e) => { if (!draft.trim() && !e.currentTarget.form?.contains(e.relatedTarget as Node)) setOpen(false) }}
        placeholder={event ? `An event on ${weekday}…` : `Add to ${weekday}…`}
        className="min-w-0 flex-1 bg-transparent py-0.5 text-[14px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
      />
      {/* "Can't move": an appointment has a time (2026-10-04). */}
      {withTime && <input type="time" aria-label={`Time on ${weekday}`} value={time} required={event} onChange={(e) => setTime(e.target.value)}
        className="w-[6.5rem] shrink-0 rounded border border-neutral-200 bg-transparent px-1 py-0.5 text-[13px] text-neutral-800" />}
    </form>
  )
}

function DayWeather({ weather, narrow }: { weather: DayForecast; narrow: boolean }) {
  const label = `${weatherCondition(weather.code)}, high ${weather.high}°, low ${weather.low}°`
  return (
    <span className="mt-1.5 flex items-center gap-1 text-[11px] tabular-nums text-neutral-500" title={label} aria-label={label} role="img">
      {createElement(weatherIcon(weather.code), { className: 'h-3.5 w-3.5 shrink-0', strokeWidth: 1.5, 'aria-hidden': true })}
      <span aria-hidden="true">{weather.high}°</span>
      {!narrow && <span aria-hidden="true" className="text-neutral-400">{weather.low}°</span>}
    </span>
  )
}

function DayRow({ day, onSelectItem, onToggleEntry, onPlanDrop, onAddToDay, dragEnabled, narrow, timingControl, weather }: {
  day: JournalDay
  weather?: DayForecast
  onSelectItem: (id: string) => void
  onToggleEntry: WeekJournalProps['onToggleEntry']
  onPlanDrop?: WeekJournalProps['onPlanDrop']
  onAddToDay?: WeekJournalProps['onAddToDay']
  dragEnabled: boolean
  narrow: boolean
  timingControl?: WeekJournalProps['timingControl']
}) {
  const { setNodeRef, isOver: dndOver } = useDroppable({
    id: `journal-day:${day.key}`,
    data: { kind: 'allDay', dayIso: day.key },
  })
  const [planOver, setPlanOver] = useState(false)
  const planProps = onPlanDrop ? planDropHandlers((p) => onPlanDrop(day, p), setPlanOver) : {}
  const today = isToday(day.date)
  const empty = day.notes.length + day.entries.length + day.foldedRoutines.length + day.dinners.length === 0

  return (
    <section
      ref={setNodeRef}
      {...planProps}
      aria-label={day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      data-testid={`journal-day-${day.key}`}
      className={`group/day grid min-w-0 border-t border-neutral-300 py-3 text-[14px] transition-colors first:border-t-0 ${
        narrow ? 'grid-cols-[2.75rem_minmax(0,1fr)] gap-3' : 'grid-cols-[4rem_minmax(0,1fr)] gap-5 min-h-[5.5rem]'
      } ${dndOver || planOver ? 'bg-primary-50/60' : ''}`}
    >
      <header className="pt-0.5">
        <span className={`block font-display leading-none ${narrow ? 'text-[24px]' : 'text-[28px]'} ${today ? 'text-primary-700' : 'text-neutral-900'}`}>
          {day.date.getDate()}
        </span>
        <span className={`mt-1 block text-[11px] font-semibold uppercase tracking-[0.08em] ${today ? 'text-primary-700' : 'text-neutral-500'}`}>
          {day.date.toLocaleDateString('en-US', { weekday: 'short' })}
        </span>
        {today && <span className="sr-only">(today)</span>}
        {weather && <DayWeather weather={weather} narrow={narrow} />}
      </header>

      <div className="flex min-w-0 flex-col gap-1.5">
        {day.notes.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
            {day.notes.map((ev) => (
              <li key={ev.google_event_id || ev.id}>
                <button type="button" onClick={() => onSelectItem(eventId(ev))}
                  className="text-left italic leading-snug text-neutral-600 break-words hover:text-neutral-900">
                  {ev.title}
                </button>
              </li>
            ))}
          </ul>
        )}

        {day.entries.length + day.foldedRoutines.length > 0 && <div className="journal-day-groups">
          {[{ label: 'Schedule', entries: day.entries.filter(entry => entry.time) },
            { label: 'Any time', entries: [...day.entries.filter(entry => !entry.time), ...day.foldedRoutines] }].filter(group => group.entries.length).map(group =>
            <section key={group.label} aria-label={group.label}>
              <h3>{group.label}</h3>
              <ul className="flex flex-col gap-2" aria-label={group.label + ' entries'}>
                {group.entries.map(entry => <Entry key={entry.id} entry={entry} day={day} onSelect={onSelectItem} onToggle={onToggleEntry} dragEnabled={dragEnabled} timingControl={timingControl} />)}
              </ul>
            </section>)}
        </div>}

        {day.dinners.length > 0 && (
          <p className="text-[12.5px] leading-snug text-neutral-500">
            <span className="text-neutral-400">Dinner </span>
            {day.dinners.map(({ event, label }, i) => (
              <span key={event.google_event_id || event.id}>
                {i > 0 && ' · '}
                <button type="button" onClick={() => onSelectItem(eventId(event))} className="text-left hover:text-neutral-800 hover:underline">
                  {label}
                </button>
              </span>
            ))}
          </p>
        )}

        {empty && !onAddToDay && <span aria-hidden="true" className="text-[12px] text-neutral-300">—</span>}
        {onAddToDay && <AddToDay day={day} onAdd={onAddToDay} />}
      </div>
    </section>
  )
}

// ── The grid (spec 2026-10-03-week-grid-design §1, §5, §6) ──────────────

/** A day's free time between 7a and 9p, from everything timed on it —
 *  the every-day routines included, though they are written above. */
function dayFree(day: JournalDay): string {
  // Done or not, a timed thing took its time.
  const timed = day.entries.filter((e) => e.time)
  // An hour or more counts; the half hour between dinner and bedtime doesn't.
  return formatFree(freeWindows(busyBlocks(timed.map((e) => ({ start: e.time!, end: e.end }))), 1))
}

function DayCell({ day, onSelectItem, onToggleEntry, onPlanDrop, onAddToDay, onAddEvent, dragEnabled, timingControl, weather, fixedOnly = false, free, memberById, forLabel, forControl }: {
  onAddEvent?: WeekJournalProps['onAddEvent']
  memberById?: Map<string, FamilyMember>
  forLabel?: WeekJournalProps['forLabel']
  forControl?: WeekJournalProps['forControl']
  fixedOnly?: boolean
  routinesOpen?: boolean
  /** "Free 9a–5p", from the whole day (rhythm included). */
  free?: string
  day: JournalDay
  weather?: DayForecast
  onSelectItem: (id: string) => void
  onToggleEntry: WeekJournalProps['onToggleEntry']
  onPlanDrop?: WeekJournalProps['onPlanDrop']
  onAddToDay?: WeekJournalProps['onAddToDay']
  dragEnabled: boolean
  timingControl?: WeekJournalProps['timingControl']
}) {
  const { setNodeRef, isOver: dndOver } = useDroppable({ id: `journal-day:${day.key}`, data: { kind: 'allDay', dayIso: day.key } })
  const [planOver, setPlanOver] = useState(false)
  const planProps = onPlanDrop ? planDropHandlers((p) => onPlanDrop(day, p), setPlanOver) : {}
  const today = isToday(day.date)
  const past = !today && day.date.getTime() < new Date().setHours(0, 0, 0, 0)
  // "Can't move": what is on the calendar, nothing else (Scott, 2026-10-04:
  // "should be calendared events only").
  // What is particular to the day — its routines too, now the every-day
  // ones are written once above (no fold, no count).
  const shown = fixedOnly ? day.entries.filter((e) => e.kind === 'event') : [...day.entries, ...day.foldedRoutines]
  return (
    <section ref={setNodeRef} {...planProps} data-testid={`journal-day-${day.key}`}
      aria-label={day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      className={`wk-cell group/day${dndOver || planOver ? ' is-over' : ''}${today ? ' is-today' : ''}${past ? ' is-past' : ''}`}>
      <header className="wk-dayhead">
        <span className="wk-daynum">{day.date.getDate()}</span>
        <span className="wk-dayname">{day.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
        {today && <span className="sr-only">(today)</span>}
        {weather && <DayWeather weather={weather} narrow={false} />}
      </header>
      {day.notes.length > 0 && (
        <p className="wk-notes">{day.notes.map((ev, i) => (
          <span key={ev.google_event_id || ev.id}>{i > 0 && ' · '}
            <button type="button" onClick={() => onSelectItem(eventId(ev))} className="italic hover:text-neutral-900">{ev.title}</button>
          </span>
        ))}</p>
      )}
      {shown.length > 0 && (
        <ul className="wk-rows" aria-label={`${day.date.toLocaleDateString('en-US', { weekday: 'long' })} entries`}>
          {shown.map((entry) => <Entry key={entry.id} entry={entry} day={day} onSelect={onSelectItem} onToggle={onToggleEntry} dragEnabled={dragEnabled} timingControl={timingControl} dense memberById={memberById} forLabel={forLabel} forControl={forControl} />)}
        </ul>
      )}
      {day.dinners.length > 0 && (
        <p className="wk-dinner"><span className="text-neutral-400">Dinner </span>
          {day.dinners.map(({ event, label }, i) => (
            <span key={event.google_event_id || event.id}>{i > 0 && ' · '}
              <button type="button" onClick={() => onSelectItem(eventId(event))} className="hover:text-neutral-800 hover:underline">{label}</button>
            </span>
          ))}
        </p>
      )}
      {fixedOnly
        ? onAddEvent && <AddToDay day={day} onAdd={(d, title, time) => onAddEvent(d, title, time ?? '09:00')} withTime event />
        : onAddToDay && <AddToDay day={day} onAdd={onAddToDay} />}
      {free && <p className="wk-free">{free}</p>}
    </section>
  )
}

/** "Sometime this weekend": the weekend's window work, once for both days.
 *  Ticked here, it is done for the weekend; dragged onto Saturday or Sunday,
 *  it is given that day. */
function SometimeCell({ weekend, days, onSelectItem, onToggleEntry, dragEnabled, memberById }: {
  memberById?: Map<string, FamilyMember>
  weekend: JournalWeekend
  days: JournalDay[]
  onSelectItem: (id: string) => void
  onToggleEntry: WeekJournalProps['onToggleEntry']
  dragEnabled: boolean
}) {
  const sat = days[weekend.satIndex]
  const sun = weekend.sunIndex !== null ? days[weekend.sunIndex] : null
  // Done on the day it is done: today when today is the weekend, else Saturday.
  const tickDay = sun && isToday(sun.date) ? sun : sat
  return (
    <section className="wk-cell wk-sometime" data-testid="weekend-sometime" aria-label="Sometime this weekend">
      {/* "Both days" only when both are in this week: a Sunday-start week
          shows Saturday alone, its Sunday opening next week (2026-10-08). */}
      <header className="wk-dayhead"><span className="wk-dayname">Sometime this weekend</span><span className="wk-dayhint">{sun ? 'once for both days' : 'once for the weekend'}</span></header>
      {weekend.sometime.length ? (
        <ul className="wk-rows" aria-label="Sometime this weekend entries">
          {weekend.sometime.map((entry) => <Entry key={entry.id} entry={entry} day={tickDay} onSelect={onSelectItem} onToggle={onToggleEntry} dragEnabled={dragEnabled} dense fromSometime memberById={memberById} />)}
        </ul>
      ) : <p className="wk-empty">Nothing waiting for the weekend.</p>}
      {weekend.sometime.length > 0 && <p className="wk-dayhint">Drag one onto {sun ? 'Saturday or Sunday' : 'Saturday'} to give it a day.</p>}
    </section>
  )
}

/** Was the weekend's choice to stay open remembered? Per weekend (by its
 *  Saturday), in this browser only. */
const weekendOpenKey = (satKey: string) => `symphony-week-weekend-open:${satKey}`
function readWeekendOpen(satKey: string): boolean {
  try { return localStorage.getItem(weekendOpenKey(satKey)) === '1' } catch { return false }
}
function writeWeekendOpen(satKey: string, open: boolean) {
  try { if (open) localStorage.setItem(weekendOpenKey(satKey), '1'); else localStorage.removeItem(weekendOpenKey(satKey)) } catch { /* the choice just isn't kept */ }
}

/** A weekend that is over, in the week still being lived (a Saturday-start
 *  week from Monday on). Scott, 2026-10-05: the expanded weekend at the top
 *  of the page "doesn't make sense when it's past the weekend". A past week
 *  stays whole — looking back is why you're there. */
function weekendIsBehind(days: JournalDay[], weekend: JournalWeekend, now = new Date()): boolean {
  const last = days[weekend.sunIndex ?? weekend.satIndex].date
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const inThisWeek = days.some((d) => d.date.getFullYear() === now.getFullYear() && d.date.getMonth() === now.getMonth() && d.date.getDate() === now.getDate())
  return inThisWeek && last.getTime() < todayStart.getTime()
}

/** A weekend split by the week's edge (a Sunday-start week): Saturday is
 *  this week's last day, and the Sunday after it begins the next week — it
 *  is never pulled back here, and the Sunday at the top of this week belongs
 *  to the weekend before. Said once, in the band, with its date. */
function splitSundayNote(sat: Date): string {
  const sun = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 1)
  return `Sunday ${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} is in next week`
}

/** The past weekend, folded to one line: when it was and what happened.
 *  What's left of it is already elsewhere — an unticked task is back on the
 *  week's list (missedPlacement), and weekend chores wait for the next one. */
function WeekendFoldLine({ days, weekend, onOpen }: { days: JournalDay[]; weekend: JournalWeekend; onOpen: () => void }) {
  const sat = days[weekend.satIndex]
  const sun = weekend.sunIndex !== null ? days[weekend.sunIndex] : null
  const month = sat.date.toLocaleDateString('en-US', { month: 'short' })
  const when = sun ? `Sat ${sat.date.getDate()} – Sun ${sun.date.getDate()}` : `Sat ${sat.date.getDate()}`
  const events = [sat, ...(sun ? [sun] : [])].flatMap((d) => [...d.notes.map((n) => n.title), ...d.entries.filter((e) => e.kind === 'event').map((e) => e.title)])
    .map((t) => t.trim()).filter((t, i, all) => t && all.indexOf(t) === i).slice(0, 4)
  return (
    <button type="button" className="wk-weekend-fold" data-testid="weekend-folded" aria-expanded={false}
      aria-label={`Show the weekend, ${month} ${sat.date.getDate()}${sun ? `–${sun.date.getDate()}` : ''}`} onClick={onOpen}>
      <span className="wk-weekend-fold-title">The weekend</span>
      <span className="wk-weekend-fold-when">{when}</span>
      {events.length > 0 && <span className="wk-weekend-fold-events">{events.map((t) => <span key={t}>{t}</span>)}</span>}
      <span className="wk-weekend-fold-open">Show the weekend ›</span>
    </button>
  )
}

function WeekGridDays({ days, weekend, forecast, fixedOnly = false, free, ...cell }: {
  onAddEvent?: WeekJournalProps['onAddEvent']
  memberById?: Map<string, FamilyMember>
  forLabel?: WeekJournalProps['forLabel']
  forControl?: WeekJournalProps['forControl']
  fixedOnly?: boolean
  /** Each day's free time, by key. */
  free?: Record<string, string>
  routinesOpen?: boolean
  days: JournalDay[]
  weekend: JournalWeekend | null
  forecast?: Record<string, DayForecast>
  onSelectItem: (id: string) => void
  onToggleEntry: WeekJournalProps['onToggleEntry']
  onPlanDrop?: WeekJournalProps['onPlanDrop']
  onAddToDay?: WeekJournalProps['onAddToDay']
  dragEnabled: boolean
  timingControl?: WeekJournalProps['timingControl']
}) {
  // In day order: runs of weekdays as one row, the weekend as its band.
  const blocks: ({ kind: 'weekdays'; days: JournalDay[] } | { kind: 'weekend' })[] = []
  days.forEach((d, i) => {
    if (weekend && i === weekend.satIndex) { blocks.push({ kind: 'weekend' }); return }
    if (weekend && i === weekend.sunIndex) return
    const last = blocks[blocks.length - 1]
    if (last?.kind === 'weekdays') last.days.push(d)
    else blocks.push({ kind: 'weekdays', days: [d] })
  })
  const dayCell = (d: JournalDay) => <DayCell key={d.key} day={d} weather={forecast?.[d.key]} fixedOnly={fixedOnly} free={free?.[d.key]} {...cell} />
  // Once the weekend is behind you it folds to a line, so the days still
  // ahead lead the page. Opening it is remembered for that weekend.
  const satKey = weekend ? days[weekend.satIndex].key : ''
  const behind = !!weekend && !fixedOnly && weekendIsBehind(days, weekend)
  const [openFor, setOpenFor] = useState<Record<string, boolean>>({})
  const open = behind && (openFor[satKey] ?? readWeekendOpen(satKey))
  const setOpen = (next: boolean) => { writeWeekendOpen(satKey, next); setOpenFor((m) => ({ ...m, [satKey]: next })) }
  return (
    <div className="wk-grid">
      {blocks.map((b, i) => b.kind === 'weekend' && weekend && behind && !open ? (
        <WeekendFoldLine key="weekend" days={days} weekend={weekend} onOpen={() => setOpen(true)} />
      ) : b.kind === 'weekend' && weekend ? (
        <section key="weekend" className={`wk-weekend${behind ? ' is-past' : ''}`} aria-label={`The weekend, ${days[weekend.satIndex].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}>
          <div className="wk-weekend-head">The weekend
            {weekend.sunIndex === null && <span className="wk-weekend-split" data-testid="weekend-split">{splitSundayNote(days[weekend.satIndex].date)}</span>}
            {behind && <button type="button" className="wk-weekend-fold-close" aria-expanded onClick={() => setOpen(false)}>Fold it ‹</button>}
          </div>
          <div className="wk-weekend-cells">
            {dayCell(days[weekend.satIndex])}
            {weekend.sunIndex !== null && dayCell(days[weekend.sunIndex])}
            {!fixedOnly && <SometimeCell weekend={weekend} days={days} onSelectItem={cell.onSelectItem} onToggleEntry={cell.onToggleEntry} dragEnabled={cell.dragEnabled} memberById={cell.memberById} />}
          </div>
        </section>
      ) : b.kind === 'weekdays' ? (
        <section key={`wd${i}`} className="wk-weekdays" aria-label="Weekdays" style={{ ['--wk-days' as string]: b.days.length }}>
          {b.days.map(dayCell)}
        </section>
      ) : null)}
    </div>
  )
}

export function WeekJournal({ days, weekend = null, spans, onSelectItem, onToggleEntry, onPlanDrop, onAddToDay: addToDay, onAddEvent: addEvent, dragEnabled: canDrag = true, narrow = false, layout = 'rows', timingControl: timing, forecast, show = 'all', routinesOpen = false, readOnly = false, variant, person, members = [], dailyRoutines = false, forLabel, forControl }: WeekJournalProps) {
  if (variant === 'strip') return <WeekStrip days={days} onSelectItem={onSelectItem} />
  if (variant === 'shape') return <WeekShape days={days} members={members} person={person} onSelectItem={onSelectItem} />
  // The finished plan is read: nothing moves, nothing is added or retimed.
  const dragEnabled = canDrag && !readOnly
  const onAddToDay = readOnly ? undefined : addToDay
  const timingControl = readOnly ? undefined : timing
  // The grid writes the every-day and every-weekday routines once, above.
  const fixedOnly = show === 'fixed'
  // Every-day and every-weekday routines are the same every week and are
  // ticked on Today: the week hides them unless asked to show them (Scott,
  // 2026-10-04). Either way they count as time taken in each day's free time.
  const rhythm = layout === 'grid' && !dailyRoutines ? weekRhythm(days) : { everyDay: [], weekdays: [], days }
  const memberById = members.length ? new Map(members.map((m) => [m.id, m])) : undefined
  // Free time is planning information: today and the days ahead.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const free = layout === 'grid' ? Object.fromEntries(days.filter((d) => d.date >= todayStart).map((d) => [d.key, dayFree(d)])) : undefined
  return (
    <div data-testid="week-journal" className={layout === 'grid' ? 'wk-journal-grid' : 'border-y border-neutral-300'}>
      {spans.length > 0 && (
        <ul aria-label="Across these days" className="flex flex-col gap-1 border-b border-neutral-300 py-2 text-[13px]">
          {spans.map((s) => (
            <li key={s.event.google_event_id || s.event.id} className={narrow ? '' : 'pl-[5.25rem]'}>
              <button type="button" onClick={() => onSelectItem(eventId(s.event))} className="text-left text-neutral-700 hover:text-neutral-950">
                <span className="text-neutral-400">
                  {days[s.startCol].date.toLocaleDateString('en-US', { weekday: 'short' })}
                  {s.endCol !== s.startCol && `–${days[s.endCol].date.toLocaleDateString('en-US', { weekday: 'short' })}`}
                </span>{' '}
                {s.event.title.trim()}
                {(s.continuesBefore || s.continuesAfter) && (
                  <span className="text-neutral-400">
                    {s.continuesBefore && `, from ${spanDayLabel(s.first)}`}
                    {s.continuesAfter && `, through ${spanDayLabel(s.last)}`}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {layout === 'grid' ? (
        <>
          <WeekGridDays days={rhythm.days} weekend={weekend} forecast={forecast} onSelectItem={onSelectItem} onToggleEntry={onToggleEntry}
            onPlanDrop={readOnly ? undefined : onPlanDrop} onAddToDay={onAddToDay} onAddEvent={readOnly ? undefined : addEvent} dragEnabled={dragEnabled} timingControl={timingControl}
            fixedOnly={fixedOnly} routinesOpen={routinesOpen} free={free} memberById={memberById} forLabel={forLabel} forControl={readOnly ? undefined : forControl} />
        </>
      ) : days.map((day) => (
        <DayRow key={day.key} day={day} onSelectItem={onSelectItem} onToggleEntry={onToggleEntry}
          onPlanDrop={onPlanDrop} onAddToDay={onAddToDay} dragEnabled={dragEnabled} narrow={narrow}
          timingControl={timingControl} weather={forecast?.[day.key]} />
      ))}
    </div>
  )
}
