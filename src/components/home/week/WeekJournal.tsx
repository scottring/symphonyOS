//
// /week as a journal spread (Scott, 2026-09-19): Month shows what's coming,
// Week distributes commitments, Today is where you work through them. Seven
// day columns, each read top to bottom like a paper planner page — the day's
// appointments with small time labels, then the things given to that day
// without a time, routines quiet at the foot. Anything that covers several
// days (on call, a trip, a school break) is drawn once, across the top of the
// days it covers, the way a line is ruled across a paper week.
//
// Each day is ONE drop target speaking the grid's all-day protocol
// ({kind:'allDay', dayIso}), so a list row dropped here rides
// useWeekDragDrop's existing branch — past-day refusal, the timed-bucket
// write and undo included. Nothing here writes on its own.
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Check } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { TimelineItem } from '@/types/timeline'
import { isMissedPlacement } from '@/lib/week/missedPlacement'
import { journalTime, type ContextSpan } from '@/lib/week/journalSpread'

export interface JournalLine {
  /** Selectable id — 'task-<uuid>' / 'event-<id>'. */
  id: string
  time: Date
  title: string
  subtitle?: string
  /** Present for a timed task: the line gets a tick. */
  task?: Task
}

export interface JournalDay {
  date: Date
  /** Local YYYY-MM-DD. */
  key: string
  /** Single-day all-day calendar events (a holiday, "no school"). */
  notes: CalendarEvent[]
  /** Timed events and timed tasks, in time order. */
  lines: JournalLine[]
  /** Tasks given to the day with no time. */
  tasks: Task[]
  routines: TimelineItem[]
  dinners: { event: CalendarEvent; label: string }[]
}

interface WeekJournalProps {
  days: JournalDay[]
  spans: ContextSpan[]
  onSelectItem: (id: string) => void
  onToggleTask: (task: Task) => void
  /** Stacked single column for narrow screens. */
  narrow?: boolean
  /** Rows can be picked up. Off on touch-width layouts, where a drag handle
   *  would swallow the scroll. */
  dragEnabled?: boolean
}

const eventId = (ev: CalendarEvent) => `event-${ev.google_event_id || ev.id}`

function isToday(d: Date): boolean {
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function Tick({ task, onToggle }: { task: Task; onToggle: (t: Task) => void }) {
  return (
    <button
      type="button"
      aria-label={task.completed ? `Mark ${task.title} not done` : `Complete ${task.title}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle(task) }}
      className={`mt-[3px] shrink-0 grid h-3 w-3 place-items-center rounded-full border transition-colors ${
        task.completed
          ? 'border-neutral-400 bg-neutral-400 text-white'
          : 'border-neutral-400 text-transparent hover:border-primary-500 hover:bg-primary-500 hover:text-white'
      }`}
    >
      <Check className="h-2 w-2" strokeWidth={3} />
    </button>
  )
}

function DayTask({ task, onSelect, onToggle, dragEnabled }: {
  task: Task
  onSelect: (id: string) => void
  onToggle: (t: Task) => void
  dragEnabled: boolean
}) {
  // A different id from the grid chip's 'chip:' so the two surfaces never
  // share a registration; the DATA is the chip protocol, so a drop onto
  // another day moves it through the same branch.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `journal:${task.id}`,
    data: { kind: 'chip', taskId: task.id },
    disabled: !dragEnabled || task.completed,
  })
  // Its day passed without a tick — the live copy is back on the list; what
  // stays here is the record, faded.
  const missed = isMissedPlacement(task.scheduledFor, task.completed, new Date())
  return (
    <li
      ref={setNodeRef}
      {...(dragEnabled && !task.completed ? { ...attributes, ...listeners } : {})}
      className={`group flex items-start gap-1.5 ${dragEnabled && !task.completed ? 'cursor-grab touch-none' : ''} ${isDragging ? 'opacity-40' : ''} ${missed ? 'opacity-50' : ''}`}
    >
      <Tick task={task} onToggle={onToggle} />
      <button
        type="button"
        onClick={() => onSelect(`task-${task.id}`)}
        title={missed ? `${task.title} — didn't happen` : task.title}
        className={`min-w-0 flex-1 text-left leading-snug break-words line-clamp-3 hover:text-neutral-950 ${
          task.completed ? 'line-through text-neutral-400' : 'text-neutral-800'
        }`}
      >
        {task.title}
      </button>
    </li>
  )
}

function DayColumn({ day, narrow, onSelectItem, onToggleTask, dragEnabled }: {
  day: JournalDay
  narrow: boolean
  onSelectItem: (id: string) => void
  onToggleTask: (t: Task) => void
  dragEnabled: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `journal-day:${day.key}`,
    data: { kind: 'allDay', dayIso: day.key },
  })
  const today = isToday(day.date)
  const weekday = day.date.toLocaleDateString('en-US', { weekday: narrow ? 'long' : 'short' })
  const empty = day.notes.length + day.lines.length + day.tasks.length + day.routines.length + day.dinners.length === 0

  return (
    <section
      ref={setNodeRef}
      aria-label={day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      data-testid={`journal-day-${day.key}`}
      className={`min-w-0 text-[13px] transition-colors ${
        narrow
          ? 'grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 border-t border-neutral-200 py-3'
          : 'flex min-h-[18rem] flex-col border-l border-neutral-200 px-2 pb-4 pt-2 first:border-l-0'
      } ${isOver ? 'bg-primary-50/60' : ''}`}
    >
      <header className={narrow ? 'pt-0.5' : 'mb-2 flex items-baseline gap-1.5'}>
        <span className={`block text-[11px] font-semibold uppercase tracking-[0.08em] ${today ? 'text-primary-700' : 'text-neutral-500'}`}>
          {narrow ? weekday.slice(0, 3) : weekday}
        </span>
        <span
          className={`font-display leading-none ${narrow ? 'block text-[26px]' : 'text-[22px]'} ${today ? 'text-primary-700' : 'text-neutral-900'}`}
        >
          {day.date.getDate()}
        </span>
        {today && <span className="sr-only">(today)</span>}
      </header>

      <div className="flex min-w-0 flex-col gap-2">
        {day.notes.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {day.notes.map((ev) => (
              <li key={ev.google_event_id || ev.id}>
                <button
                  type="button"
                  onClick={() => onSelectItem(eventId(ev))}
                  className="text-left italic leading-snug text-neutral-600 break-words hover:text-neutral-900"
                >
                  {ev.title}
                </button>
              </li>
            ))}
          </ul>
        )}

        {day.lines.length > 0 && (
          <ul className="flex flex-col gap-1.5" aria-label="Appointments">
            {day.lines.map((line) => (
              <li key={line.id} className="flex min-w-0 items-start gap-1.5">
                {line.task && <Tick task={line.task} onToggle={onToggleTask} />}
                <button
                  type="button"
                  onClick={() => onSelectItem(line.id)}
                  title={line.title}
                  className="min-w-0 flex-1 text-left leading-snug hover:text-neutral-950"
                >
                  <time
                    dateTime={line.time.toISOString()}
                    className="mr-1 text-[11px] tabular-nums text-neutral-400"
                  >
                    {journalTime(line.time)}
                  </time>
                  <span className={`break-words ${line.task?.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}`}>
                    {line.title}
                  </span>
                  {line.subtitle && (
                    <span className="block text-[11.5px] leading-snug text-neutral-500 break-words">{line.subtitle}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {day.tasks.length > 0 && (
          <ul
            className={`flex flex-col gap-1 ${day.lines.length > 0 || day.notes.length > 0 ? 'border-t border-neutral-200/80 pt-2' : ''}`}
            aria-label="For this day"
          >
            {day.tasks.map((t) => (
              <DayTask key={t.id} task={t} onSelect={onSelectItem} onToggle={onToggleTask} dragEnabled={dragEnabled} />
            ))}
          </ul>
        )}

        {day.dinners.length > 0 && (
          <p className="text-[12px] leading-snug text-neutral-500">
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

        {/* Routines are the week's weather, not its news: one quiet line. */}
        {day.routines.length > 0 && (
          <p className="text-[11.5px] leading-snug text-neutral-400" aria-label="Routines">
            {day.routines.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ' · '}
                <button
                  type="button"
                  onClick={() => onSelectItem(r.id.replace(/-day\d+$/, ''))}
                  className={`text-left hover:text-neutral-700 ${r.completed ? 'line-through' : ''}`}
                >
                  {r.startTime && <span className="tabular-nums">{journalTime(r.startTime)} </span>}
                  <span>{r.title}</span>
                </button>
              </span>
            ))}
          </p>
        )}

        {empty && !narrow && <span aria-hidden="true" className="flex-1" />}
        {empty && narrow && <span className="text-[12px] text-neutral-400">Nothing yet</span>}
      </div>
    </section>
  )
}

function SpanBar({ span, onSelect }: { span: ContextSpan; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(eventId(span.event))}
      style={{ gridColumn: `${span.startCol + 1} / ${span.endCol + 2}`, gridRow: span.row + 1 }}
      title={span.event.title}
      className="group flex min-w-0 items-center gap-1.5 px-2 text-left text-[12px] leading-5 text-neutral-700 hover:text-neutral-950"
    >
      {span.continuesBefore && <span aria-hidden="true" className="text-neutral-400">←</span>}
      <span className="shrink truncate">{span.event.title}</span>
      {/* The ruled line of a paper week: the label, then a line to the last day. */}
      <span aria-hidden="true" className="min-w-3 flex-1 border-t border-neutral-500/70 group-hover:border-neutral-800" />
      {span.continuesAfter && <span aria-hidden="true" className="text-neutral-400">→</span>}
      <span className="sr-only">
        {span.continuesBefore ? ', began earlier' : ''}{span.continuesAfter ? ', continues after this range' : ''}
      </span>
    </button>
  )
}

export function WeekJournal({ days, spans, onSelectItem, onToggleTask, narrow = false, dragEnabled = true }: WeekJournalProps) {
  const cols = `repeat(${days.length}, minmax(0, 1fr))`

  if (narrow) {
    return (
      <div data-testid="week-journal" className="flex flex-col">
        {spans.length > 0 && (
          <ul aria-label="Across these days" className="flex flex-col gap-1 border-t border-neutral-300 py-2 text-[13px]">
            {spans.map((s) => (
              <li key={s.event.google_event_id || s.event.id}>
                <button type="button" onClick={() => onSelectItem(eventId(s.event))} className="text-left text-neutral-700">
                  <span className="text-neutral-400">
                    {days[s.startCol].date.toLocaleDateString('en-US', { weekday: 'short' })}–{days[s.endCol].date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>{' '}
                  {s.event.title}
                  {(s.continuesBefore || s.continuesAfter) && (
                    <span className="text-neutral-400">
                      {s.continuesBefore && ', began earlier'}{s.continuesAfter && ', continues on'}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {days.map((day) => (
          <DayColumn key={day.key} day={day} narrow onSelectItem={onSelectItem} onToggleTask={onToggleTask} dragEnabled={dragEnabled} />
        ))}
      </div>
    )
  }

  return (
    <div data-testid="week-journal" className="border-y border-neutral-300">
      {spans.length > 0 && (
        <div
          aria-label="Across these days"
          role="group"
          className="grid gap-y-1 border-b border-neutral-200 py-1.5"
          style={{ gridTemplateColumns: cols }}
        >
          {spans.map((s) => (
            <SpanBar key={s.event.google_event_id || s.event.id} span={s} onSelect={onSelectItem} />
          ))}
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: cols }}>
        {days.map((day) => (
          <DayColumn key={day.key} day={day} narrow={false} onSelectItem={onSelectItem} onToggleTask={onToggleTask} dragEnabled={dragEnabled} />
        ))}
      </div>
    </div>
  )
}
