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
import { useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Check, Plus } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { TimelineItem } from '@/types/timeline'
import { isMissedPlacement } from '@/lib/week/missedPlacement'
import { journalTime, type ContextSpan } from '@/lib/week/journalSpread'
import { planDropHandlers, type PlanDragPayload } from '@/lib/planning/planDrag'

export interface JournalEntry {
  /** Selectable id — 'task-<uuid>', 'event-<id>', 'routine-<id>'. */
  id: string
  kind: 'event' | 'task' | 'routine'
  /** Present when the entry has a time. */
  time?: Date
  title: string
  subtitle?: string
  completed: boolean
  /** Tasks: the row. Drags between days (untimed only). */
  task?: Task
  /** Routines: the occurrence's routine id, for completion. */
  routineId?: string
}

export interface JournalDay {
  date: Date
  /** Local YYYY-MM-DD. */
  key: string
  /** Single-day all-day calendar events (a holiday, "no school"). */
  notes: CalendarEvent[]
  /** Timed entries in time order, then untimed ones. */
  entries: JournalEntry[]
  /** Untimed routine occurrences not chosen for the day. */
  available: TimelineItem[]
  dinners: { event: CalendarEvent; label: string }[]
}

interface WeekJournalProps {
  days: JournalDay[]
  spans: ContextSpan[]
  onSelectItem: (id: string) => void
  onToggleEntry: (entry: JournalEntry, day: JournalDay) => void
  /** A row dragged out of the Today pin, dropped on a day. */
  onPlanDrop?: (day: JournalDay, payload: PlanDragPayload) => void
  /** "+ Add" on a day: a task straight onto that day. Omitted = no control.
   *  (Walkthrough 2026-09-20: "there's no way in the UI to add a task
   *  straight to a day on week" — only ⌘K-with-a-date and the hourly grid.) */
  onAddToDay?: (day: JournalDay, title: string) => void
  /** Rows can be picked up. Off on touch-width layouts, where a drag handle
   *  would swallow the scroll. */
  dragEnabled?: boolean
  /** Narrow screens: the margin tightens; the layout is the same. */
  narrow?: boolean
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

function Box({ entry, onToggle }: { entry: JournalEntry; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={entry.completed ? `Mark ${entry.title} not done` : `Complete ${entry.title}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className="journal-check shrink-0"
    >
      <span aria-hidden="true" className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border ${entry.completed ? 'border-neutral-500 bg-neutral-500 text-white' : 'border-neutral-400 text-transparent'}`}>
      <Check className="h-2.5 w-2.5" strokeWidth={3} /></span>
    </button>
  )
}

function Entry({ entry, day, onSelect, onToggle, dragEnabled }: {
  entry: JournalEntry
  day: JournalDay
  onSelect: (id: string) => void
  onToggle: (entry: JournalEntry, day: JournalDay) => void
  dragEnabled: boolean
}) {
  // An untimed task drags to another day with the chip protocol (a different
  // id from the grid chip's, so the two surfaces never share a registration).
  const movable = dragEnabled && entry.kind === 'task' && !entry.time && !entry.completed && !!entry.task
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `journal:${entry.task?.id ?? entry.id}`,
    data: { kind: 'chip', taskId: entry.task?.id },
    disabled: !movable,
  })
  // Its day passed without a tick — the live copy is back on the list; what
  // stays here is the record, faded.
  const missed = entry.task && !entry.time ? isMissedPlacement(entry.task.scheduledFor, entry.task.completed, new Date()) : false
  return (
    <li
      ref={setNodeRef}
      // Listeners only: the row stays a list item (dnd-kit's attributes would
      // make it a role="button" tab stop, and this grid has no keyboard
      // sensor — the pin and ⋯ menus are the keyboard path).
      {...(movable ? listeners : {})}
      className={`flex min-w-0 items-start gap-2 ${movable ? 'cursor-grab touch-none' : ''} ${isDragging ? 'opacity-40' : ''} ${missed ? 'opacity-50' : ''}`}
    >
      {entry.kind === 'event'
        ? <span aria-hidden="true" className="mt-[9px] h-px w-3.5 shrink-0 bg-neutral-400" />
        : <Box entry={entry} onToggle={() => onToggle(entry, day)} />}
      <button
        type="button"
        onClick={() => onSelect(entry.id)}
        title={missed ? `${entry.title} — didn't happen` : entry.title}
        className="min-w-0 flex-1 text-left leading-snug hover:text-neutral-950"
      >
        {entry.time && (
          <time dateTime={entry.time.toISOString()} className="mr-1.5 text-[12px] tabular-nums text-neutral-400">
            {journalTime(entry.time)}
          </time>
        )}
        <span className={`break-words ${entry.completed ? 'text-neutral-400 line-through' : entry.kind === 'routine' ? 'text-neutral-600' : 'text-neutral-800'}`}>
          {entry.title}
        </span>
        {entry.subtitle && (
          <span className="ml-1.5 text-[12px] text-neutral-500 break-words">{entry.subtitle}</span>
        )}
      </button>
    </li>
  )
}

function AddToDay({ day, onAdd }: { day: JournalDay; onAdd: NonNullable<WeekJournalProps['onAddToDay']> }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const weekday = day.date.toLocaleDateString('en-US', { weekday: 'long' })
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={`Add to ${weekday}`}
        className="mt-1 inline-flex items-center gap-1 self-start text-[12.5px] text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 group-hover/day:opacity-100">
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />Add
      </button>
    )
  }
  return (
    <form
      className="mt-1 flex items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (!t) return; onAdd(day, t); setDraft(''); setOpen(false) }}
    >
      <input
        autoFocus
        aria-label={`New task for ${weekday}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(''); setOpen(false) } }}
        onBlur={() => { if (!draft.trim()) setOpen(false) }}
        placeholder={`Add to ${weekday}…`}
        className="min-w-0 flex-1 bg-transparent py-0.5 text-[14px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
      />
    </form>
  )
}

function DayRow({ day, onSelectItem, onToggleEntry, onPlanDrop, onAddToDay, dragEnabled, narrow }: {
  day: JournalDay
  onSelectItem: (id: string) => void
  onToggleEntry: WeekJournalProps['onToggleEntry']
  onPlanDrop?: WeekJournalProps['onPlanDrop']
  onAddToDay?: WeekJournalProps['onAddToDay']
  dragEnabled: boolean
  narrow: boolean
}) {
  const { setNodeRef, isOver: dndOver } = useDroppable({
    id: `journal-day:${day.key}`,
    data: { kind: 'allDay', dayIso: day.key },
  })
  const [planOver, setPlanOver] = useState(false)
  const planProps = onPlanDrop ? planDropHandlers((p) => onPlanDrop(day, p), setPlanOver) : {}
  const today = isToday(day.date)
  const empty = day.notes.length + day.entries.length + day.dinners.length === 0

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

        {day.entries.length > 0 && <div className="journal-day-groups">
          {[{ label: 'Schedule', entries: day.entries.filter(entry => entry.time) },
            { label: 'Any time', entries: day.entries.filter(entry => !entry.time) }].filter(group => group.entries.length).map(group =>
            <section key={group.label} aria-label={group.label}>
              <h3>{group.label}</h3>
              <ul className="flex flex-col gap-2" aria-label={group.label + ' entries'}>
                {group.entries.map(entry => <Entry key={entry.id} entry={entry} day={day} onSelect={onSelectItem} onToggle={onToggleEntry} dragEnabled={dragEnabled} />)}
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

export function WeekJournal({ days, spans, onSelectItem, onToggleEntry, onPlanDrop, onAddToDay, dragEnabled = true, narrow = false }: WeekJournalProps) {
  return (
    <div data-testid="week-journal" className="border-y border-neutral-300">
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
      {days.map((day) => (
        <DayRow key={day.key} day={day} onSelectItem={onSelectItem} onToggleEntry={onToggleEntry}
          onPlanDrop={onPlanDrop} onAddToDay={onAddToDay} dragEnabled={dragEnabled} narrow={narrow} />
      ))}
    </div>
  )
}
