// src/components/canvas/week/WeekCanvas.tsx
//
// The Week, as approved (week composition, 2026-10-10; Scott: the wireframes'
// organisation and consistency are core requirements). Days mode of /week,
// plain and ?view=alongside:
//
//   The days         the page (Scott, 2026-10-12: calendar first; mockup
//                    approved 2026-10-13): equal columns in the household's
//                    week order — events in calendar blue, the kids' specials
//                    as chips, placed work as rows (tick, drag, tap to open) and who
//                    carries it, routines as rounded squares, the hours with
//                    nothing scheduled in green ("Calendar clear …",
//                    ROW-LANGUAGE.md); a stay across days as one bar; past
//                    days stepped back and a weekend that is over folded to a
//                    line; done work hidden until "Show done".
//   No day yet       what is chosen for this week with no day, under the
//                    days: a few as draggable rows, more folded to one line
//                    (2026-10-14). Inbox, last week and the month's goals
//                    are the planning session's.
//
// Drag a row onto a day to place it, a day's row onto another day to move
// it, back onto the No day yet line to take its day away. While dragging, the
// target day says where it will land.
// Every write is the caller's (WeekViewV2 routes them through the canvas
// activity strip with Undo); this component draws and asks.
//
// Phone (<768px): a row of day chips, the chosen day, then No day yet;
// tap opens a chip's task (no drag on touch).

import { useContext, useState, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { TriageWhenMenu, type TriageWhen } from '@/components/schedule/TriageWhenMenu'
import { formatTimeCompact } from '@/lib/dateHelpers'
import { isPlanDrag, readPlanDrag, writePlanDrag, type PlanDragPayload } from '@/lib/planning/planDrag'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { PlanMastheadSlotsContext } from '@/components/plan/v2/planMastheadSlots'
import { CompactWeekRow, type CompactRow } from './CompactWeekList'
import { GiveItADay } from './GiveItADay'
import { dayChipLabel } from './compactWeek'
import type { ShelfGroup } from './weekShelf'
import { weekSentence } from './weekSentence'

export interface CanvasDayItem {
  /** Selectable id ('task-…', 'routine-…', 'event-…'). */
  id: string
  kind: 'event' | 'task' | 'routine'
  title: string
  /** An event's second line (a School block's specials). */
  subtitle?: string
  time?: Date
  completed: boolean
  task?: Task
  routineId?: string
  /** Who carries it (household member ids); none for a calendar event. */
  people?: string[]
  /** Drawn from a pending change card: dashed, not yet saved, not interactive. */
  proposed?: boolean
  /** A proposed row that would be done or skipped: struck through. */
  struck?: boolean
  /** A proposed row's one-line reason ("Skipped · this week", "Done"). */
  note?: string
}

export interface CanvasDay {
  date: Date
  key: string
  /** Calendar events: all-day ones first, then timed. */
  events: CanvasDayItem[]
  /** Placed tasks and the day's own routines. */
  items: CanvasDayItem[]
  /** "Sometime this weekend" — drawn in the weekend's first day. */
  sometime?: CanvasDayItem[]
  /** The day's dinner, quietly ("Dinner Salmon + potatoes"). */
  /** `href`: a planned dinner opens its recipe or the meal plan; else the event opens. */
  dinners?: { id: string; label: string; href?: string }[]
  /** The day's forecast, small and muted in its header. */
  weather?: ReactNode
  /** The kids' specials, one chip each ("Ella · Library"). */
  specials?: { who: string; special: string }[]
  /** The hours with nothing scheduled ("Calendar clear 10:30a–4:15p");
   *  today and the days ahead only. */
  free?: string
}

/** A calendar event across several days, written once: a bar across the
 *  columns it covers (`from`–`to`, YYYY-MM-DD within the week). */
export interface CanvasSpan { id: string; when: string; title: string; tail?: string; from?: string; to?: string }

export interface ShelfRoutine { id: string; title: string }

export interface WeekCanvasWriters {
  placeTask: (task: Task, day: Date) => void
  moveTask: (task: Task, day: Date) => void
  unplaceTask: (task: Task) => void
  toggleTask: (task: Task) => void
  toggleRoutine: (item: CanvasDayItem, day: Date) => void
  placeRoutine: (routine: ShelfRoutine, day: Date) => void
  moveRoutine: (item: CanvasDayItem, fromKey: string, toDay: Date) => void
  /** Opens the details pane for a selectable id. */
  open: (id: string) => void
  /** A plan row from elsewhere (the Today pin) dropped on a day. */
  foreignDrop?: (day: Date, payload: PlanDragPayload) => void
  /** No day yet triage: send a task to a when (today, next week, someday …). */
  triageTask?: (task: Task, when: TriageWhen) => void
  /** No day yet triage: a specific date (and time). */
  scheduleTask?: (task: Task, at: Date, isAllDay: boolean) => void
}

export interface WeekCanvasProps {
  weekStart: Date
  days: CanvasDay[]
  shelf: ShelfGroup[]
  routinesToPlace: ShelfRoutine[]
  /** Routines written once above the days ("Every day", "Weekdays"). */
  rhythm?: { label: string; items: { title: string; openId: string }[] }[]
  isCurrent: boolean
  writers: WeekCanvasWriters
  spans?: CanvasSpan[]
  /** What each day already holds, for the day picker's spoken label
   *  (densityDescription), keyed by local YYYY-MM-DD. */
  dayDescriptions?: Record<string, string>
  /** The household: People… and the faces on each day's rows. */
  members?: (Pick<FamilyMember, 'id' | 'name'> & Partial<FamilyMember>)[]
  /** Every-day routines in each day, or written once above (the page's
   *  remembered choice). */
  daily?: { shown: boolean; onToggle: () => void }
  /** What Symphony is talking about right now: lit with the teal halo. */
  pointing?: { dates: Set<string>; taskIds: Set<string> } | null
  /** The week's tasks and calendar have loaded. Until then the sentence says
   *  nothing: an unloaded day reads as wide open. */
  loaded?: boolean
  /** Last week's progress, opening the page: "9 done last week · Review". Only
   *  where the deck may open (WeekViewV2 decides). */
  progress?: { done: number; reviewedOn?: Date; onReview: () => void }
  /** "Place them": opens the deck on this week's unplaced cards. Absent where
   *  the deck may not open; the count then stands alone. */
  onPlaceUnplaced?: () => void
}

type Drag = { kind: 'task' | 'routine' | 'occ'; id: string; groupKey?: string; fromKey?: string }
type Picker = { key: string } | null

/** More than this many with no day fold to one line under the days. */
const NODAY_FOLD_AT = 4

const longDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

export function WeekCanvas({ weekStart, days, shelf, routinesToPlace, rhythm = [], isCurrent, writers, spans = [], dayDescriptions, members = [], daily, pointing, loaded = true, progress, onPlaceUnplaced }: WeekCanvasProps) {
  const phone = useMediaQuery('(max-width: 767px)')
  const slots = useContext(PlanMastheadSlotsContext)
  const [showDone, setShowDone] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [overDay, setOverDay] = useState<string | null>(null)
  const [overShelf, setOverShelf] = useState(false)
  const [picker, setPicker] = useState<Picker>(null)
  const [weekendOpen, setWeekendOpen] = useState(false)
  const [nodayOpen, setNodayOpen] = useState<boolean | null>(null)

  const todayKey = localYmd(new Date())
  const [chosenDay, setChosenDay] = useState<string | null>(null)
  const selectedKey = chosenDay && days.some((d) => d.key === chosenDay) ? chosenDay : (days.find((d) => d.key === todayKey) ?? days[0])?.key

  const pointedDay = (key: string) => !!pointing?.dates.has(key)
  const pointedTask = (id?: string) => !!id && !!pointing?.taskIds.has(id)
  // On the phone, pointing at exactly one day of this week shows that day. It
  // happens when the pointing changes, so a tap on another day sticks.
  const [seenPointing, setSeenPointing] = useState(pointing)
  if (pointing !== seenPointing) {
    setSeenPointing(pointing)
    const only = pointing && pointing.dates.size === 1 ? [...pointing.dates][0] : null
    if (only && days.some((d) => d.key === only)) setChosenDay(only)
  }

  const dates = days.map((d) => d.date)
  const memberById = new Map(members.map((m) => [m.id, m]))

  // ── what is where ─────────────────────────────────────────────────────
  const shelfTasks = new Map<string, Task>()
  for (const g of shelf) for (const r of [...g.rows, ...g.done]) shelfTasks.set(r.task.id, r.task)
  const dayTask = (id: string) => {
    for (const d of days) for (const it of d.items) if (it.task?.id === id) return { day: d, item: it }
    return null
  }
  const dayOcc = (routineId: string, key: string) => days.find((d) => d.key === key)?.items.find((it) => it.routineId === routineId) ?? null

  // ── drag ───────────────────────────────────────────────────────────────
  const endDrag = () => { setDrag(null); setOverDay(null); setOverShelf(false) }
  const startDrag = (ev: DragEvent, payload: PlanDragPayload, d: Drag) => {
    writePlanDrag(ev.dataTransfer, payload)
    setDrag(d); setPicker(null)
  }
  const dropOnDay = (day: CanvasDay, p: PlanDragPayload) => {
    endDrag()
    if (p.kind === 'task') {
      const fromShelf = shelfTasks.get(p.id)
      if (fromShelf) { writers.placeTask(fromShelf, day.date); return }
      const placed = dayTask(p.id)
      if (placed) { if (placed.day.key !== day.key && placed.item.task) writers.moveTask(placed.item.task, day.date); return }
    } else {
      const toPlace = routinesToPlace.find((r) => r.id === p.id)
      if (toPlace) { writers.placeRoutine(toPlace, day.date); return }
      const occ = dayOcc(p.id, p.date)
      if (occ) { if (p.date !== day.key) writers.moveRoutine(occ, p.date, day.date); return }
    }
    writers.foreignDrop?.(day.date, p)
  }
  const dayDrop = (day: CanvasDay) => ({
    onDragOver: (e: DragEvent) => {
      if (!isPlanDrag(e.dataTransfer)) return
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'
      if (overDay !== day.key) setOverDay(day.key)
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setOverDay((k) => (k === day.key ? null : k))
    },
    onDrop: (e: DragEvent) => {
      const p = readPlanDrag(e.dataTransfer)
      if (!p) { endDrag(); return }
      e.preventDefault(); e.stopPropagation()
      dropOnDay(day, p)
    },
  })
  // A day's task dropped back on the shelf loses its day, keeps its week.
  const shelfDrop = {
    onDragOver: (e: DragEvent) => {
      if (!drag || drag.kind !== 'task' || !drag.fromKey) return
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverShelf(true)
    },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverShelf(false) },
    onDrop: (e: DragEvent) => {
      const p = readPlanDrag(e.dataTransfer)
      const placed = p?.kind === 'task' ? dayTask(p.id) : null
      endDrag()
      if (!placed?.item.task) return
      e.preventDefault(); e.stopPropagation()
      writers.unplaceTask(placed.item.task)
    },
  }

  // ── the shelf ──────────────────────────────────────────────────────────
  const pick = (rowKey: string, title: string, onPick: (d: Date) => void, current?: string) => (picker?.key === rowKey && (
    <GiveItADay title={title} days={dates} inline={phone} current={current} describe={dayDescriptions} label="Give it a day"
      onPick={(d) => { setPicker(null); onPick(d) }} onClose={() => setPicker(null)} />
  ))
  // ── the days ───────────────────────────────────────────────────────────
  // Who carries it, a glance from the title (ROW-LANGUAGE: people); nothing
  // for an id the household doesn't know.
  const peopleOf = (it: CanvasDayItem) => {
    const who = (it.people ?? []).flatMap((id) => { const m = memberById.get(id); return m ? [m] : [] })
    return who.length > 0 && (
      <span className="wk-people wc-people" aria-label={who.map((m) => m.name).join(', ')}>
        {who.slice(0, 3).map((m) => <AssigneeAvatar key={m.id} member={m as FamilyMember} size="sm" className="wc-avatar" />)}
      </span>
    )
  }
  const dayRow = (it: CanvasDayItem, day: CanvasDay) => {
    if (it.proposed) {
      return (
        <li key={`${day.key}:${it.id}`} className={`cw-row wc-dayrow is-proposed${it.kind === 'routine' ? ' is-routine' : ''}${pointedTask(it.task?.id) ? ' is-pointed' : ''}`} data-testid="proposed-row">
          <span className="canvas-item-title">
            <span className="cw-title">{it.struck ? <s>{it.title}</s> : it.title}</span>
            {it.time && <span className="cw-sub"><span className="cw-meta">{formatTimeCompact(it.time)}</span></span>}
            {it.note && <span className="wc-proposed-note">{it.note}</span>}
            {peopleOf(it)}
          </span>
          <span className="sr-only"> (proposed, not saved yet)</span>
        </li>
      )
    }
    const key = `${day.key}:${it.id}`
    const entityId = it.task?.id ?? it.routineId ?? it.id
    const row: CompactRow<CanvasDayItem> = { key, id: entityId, title: it.title, item: it, completed: it.completed, meta: it.time ? formatTimeCompact(it.time) : null }
    return (
      <CompactWeekRow key={key} row={row} className={`wc-dayrow${it.kind === 'routine' ? ' is-routine' : ''}${pointedTask(it.task?.id) ? ' is-pointed' : ''}`}
        onComplete={(x) => (x.task ? writers.toggleTask(x.task) : writers.toggleRoutine(x, day.date))}
        onOpen={(x) => writers.open(x.id)}
        onDragStart={phone ? undefined : (x, ev) => x.task
          ? startDrag(ev, { kind: 'task', id: x.task.id, date: day.key, title: x.title }, { kind: 'task', id: x.task.id, fromKey: day.key })
          : x.routineId ? startDrag(ev, { kind: 'routine', id: x.routineId, date: day.key, title: x.title }, { kind: 'occ', id: x.routineId, fromKey: day.key }) : undefined}
        onDragEnd={endDrag}
        under={peopleOf(it)} />
    )
  }
  const dayColumn = (day: CanvasDay, col?: number) => {
    const items = day.items.filter((it) => showDone || !it.completed)
    const sometime = (day.sometime ?? []).filter((it) => showDone || !it.completed)
    const specials = day.specials ?? []
    const empty = !day.events.length && !items.length && !sometime.length && !specials.length
    const over = overDay === day.key
    // A day gone by steps back; today and the days ahead stay at full strength.
    const gone = day.key < todayKey
    return (
      <section key={day.key} className={`wc-day${day.key === todayKey ? ' is-today' : ''}${gone ? ' is-past' : ''}${over ? ' is-over' : ''}${empty ? ' is-empty' : ''}${pointedDay(day.key) ? ' is-pointed' : ''}`}
        style={col ? { gridColumn: col } : undefined}
        aria-label={longDay(day.date)} data-testid={`journal-day-${day.key}`} {...dayDrop(day)}>
        <header className="wc-dayhead">
          <span className="wc-dayname">{day.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
          <span className="wc-daynum">{day.date.getDate()}</span>
          {day.key === todayKey && <span className="wc-todaytag">Today</span>}
          {day.weather && <span className="wc-weather">{day.weather}</span>}
        </header>
        <div className="wc-daybody">
        {over && <p className="wc-drop-hint" aria-live="polite">Drop on {dayChipLabel(day.date)}</p>}
        {specials.length > 0 && (
          <p className="today-specials wc-specials">
            {specials.map((sp) => <span key={sp.who} className="today-special-chip"><span>{sp.who}</span>{sp.special}</span>)}
          </p>
        )}
        {day.events.length > 0 && (
          <ul className="wc-events" aria-label={`${day.date.toLocaleDateString('en-US', { weekday: 'long' })} events`}>
            {day.events.map((ev) => (
              <li key={ev.id}>
                <button type="button" className="wc-event" onClick={() => writers.open(ev.id)}>
                  {ev.time && <span className="wc-event-time">{formatTimeCompact(ev.time)}</span>}
                  <span className="wc-event-title">{ev.title}{ev.subtitle && <span className="wc-event-sub">{ev.subtitle}</span>}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && <ul className="cw-rows wc-items" aria-label={`${day.date.toLocaleDateString('en-US', { weekday: 'long' })} entries`}>{items.map((it) => dayRow(it, day))}</ul>}
        {(day.dinners ?? []).length > 0 && (
          <p className="wc-dinner"><span className="wc-dinner-label">Dinner</span>{' '}
            {day.dinners!.map((d, i) => <span key={d.id}>{i > 0 && ' · '}{d.href
              ? <Link to={d.href} className="wc-rhythm-item">{d.label}</Link>
              : <button type="button" className="wc-rhythm-item" onClick={() => writers.open(d.id)}>{d.label}</button>}</span>)}
          </p>
        )}
        {sometime.length > 0 && (
          <div className="wc-sometime" aria-label="Sometime this weekend" role="group" data-testid="weekend-sometime">
            <span className="wc-sometime-label">Sometime this weekend</span>
            <ul className="cw-rows">{sometime.map((it) => dayRow(it, day))}</ul>
          </div>
        )}
        {day.free && <p className="wk-free">{day.free}</p>}
        </div>
      </section>
    )
  }
  const doneToggle = (
    <button type="button" className="canvas-link cw-done-toggle wc-done" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
      {showDone ? 'Hide done' : 'Show done'}
    </button>
  )
  // Routines that happen every day are written once above the days; the
  // page's remembered choice puts them back in each day ("Show daily").
  const shownLines = rhythm.filter((r) => r.items.length)
  const dailyToggle = daily && (
    <button type="button" className="canvas-link wc-quiet-link" aria-pressed={daily.shown} onClick={daily.onToggle}>
      {daily.shown ? 'Hide daily' : 'Show daily'}
    </button>
  )
  const rhythmNode = (shownLines.length > 0 || daily?.shown) && (
    <div className="wc-rhythm">
      {daily?.shown && <p><span className="wc-rhythm-label">Daily routines are in each day</span>{' · '}{dailyToggle}</p>}
      {shownLines.map((r, li) => (
        <p key={r.label}><span className="wc-rhythm-label">{r.label}</span>{' '}
          {r.items.map((it, i) => <span key={it.openId}>{i > 0 && ' · '}<button type="button" className="wc-rhythm-item" onClick={() => writers.open(it.openId)}>{it.title}</button></span>)}
          {li === 0 && !daily?.shown && dailyToggle && <>{' · '}{dailyToggle}</>}
        </p>
      ))}
    </div>
  )
  // A past week says so, with the way back (Scott, 2026-10-12: a page left
  // open showed last week as if it were this one).
  const past = !isCurrent && weekStart.getTime() < weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn).getTime()
  const pastNote = past && <span className="wc-past" role="note">
    <b>Past week</b> · <Link className="canvas-link" to="/week?view=alongside">Back to this week</Link>
  </span>
  // One plain sentence about the week, from the rules (weekSentence); the
  // current week only, once what it counts has loaded.
  const sentence = isCurrent && loaded ? weekSentence(days, todayKey) : null
  const unplaced = shelf.flatMap((g) => g.rows.map((r) => r.task))
  // Dragging a day's task: the line shows (even empty) so it can be dropped back.
  const draggingPlaced = drag?.kind === 'task' && !!drag.fromKey
  // A row: the title is what the pointer grabs (desktop) and what opens the
  // item; on the phone a + beside it gives the day, since touch can't drag.
  const nodayRow = (kind: 'task' | 'routine', id: string, title: string, onPlace: (d: Date) => void, onComplete?: () => void, triage?: ReactNode) => {
    const lit = kind === 'task' && pointedTask(id)
    const key = `noday:${kind}:${id}`
    return (
      <li key={key} className={`wc-noday-chip${kind === 'routine' ? ' is-routine' : ''}${lit ? ' is-pointed' : ''}`}>
        {/* A task with no day can still be done (Scott, 2026-10-14): its ring
            is the check. A routine needs a day, so its square stays a mark. */}
        {onComplete
          ? <button type="button" className="wc-noday-check" onClick={onComplete} aria-label={`Complete ${title}`} title="Mark done">
              <span className="wc-noday-glyph" aria-hidden="true"><Check size={9} strokeWidth={3} /></span>
            </button>
          : <span className="wc-noday-glyph" aria-hidden="true" />}
        <button type="button" className="wc-noday-open" draggable={!phone}
          onDragStart={(ev) => startDrag(ev, { kind, id, date: localYmd(weekStart), title }, { kind, id })}
          onDragEnd={endDrag}
          onClick={() => writers.open(`${kind}-${id}`)}>{title}</button>
        {phone && (
          <button type="button" className="wc-noday-add" aria-label={`Give ${title} a day`} aria-expanded={picker?.key === key}
            onClick={() => { setPicker(picker?.key === key ? null : { key }) }}>+</button>
        )}
        {/* Triage on hover (Scott, 2026-10-14: no Triage mode — "just add the
            triage actions on hover for each individual item"): the Inbox's
            when-chips and a date, over the row, on hover or keyboard focus. */}
        {triage && <div className="wc-noday-actions" role="group" aria-label={`When for ${title}`}>{triage}</div>}
        {pick(key, title, onPlace)}
      </li>
    )
  }
  // No day yet sits under the days (Scott, 2026-10-14: the chips across the
  // top were busy and overwhelming). A few show as they are; more fold to one
  // line, like a weekend gone by, until asked for or pointed at.
  const nodayCount = unplaced.length + routinesToPlace.length
  const nodayTitles = [...unplaced.map((t) => t.title), ...routinesToPlace.map((r) => r.title)]
  const nodayPointed = unplaced.some((t) => pointedTask(t.id))
  const nodayShown = nodayPointed || (nodayOpen ?? nodayCount <= NODAY_FOLD_AT)
  const nodayTray = (nodayCount > 0 || draggingPlaced) && (
    <div className={`wc-noday${overShelf ? ' is-over' : ''}${nodayShown ? ' is-open' : ''}`} data-explain="still-to-place" data-explain-label="No day yet" {...shelfDrop}>
      {nodayShown || nodayCount === 0 ? (
        <>
          <p className="wc-noday-head">
            <span className="wc-noday-label">No day yet</span>
            {nodayCount > 0 && <span className="wc-noday-count">{nodayCount}</span>}
            {draggingPlaced && <span className="wc-noday-hint">Drop here to take its day away</span>}
            {nodayCount > NODAY_FOLD_AT && <button type="button" className="canvas-link wc-quiet-link wc-noday-toggle" aria-expanded onClick={() => setNodayOpen(false)}>Fold</button>}
          </p>
          <ul className="wc-noday-chips" aria-label="No day yet">
            {unplaced.map((t) => nodayRow('task', t.id, t.title, (d) => writers.placeTask(t, d), () => writers.toggleTask(t), writers.triageTask && (
              <TriageWhenMenu
                onPick={(when) => writers.triageTask!(t, when)}
                onPickDate={writers.scheduleTask ? (at, allDay) => writers.scheduleTask!(t, at, allDay) : undefined}
              />
            )))}
            {routinesToPlace.map((r) => nodayRow('routine', r.id, r.title, (d) => writers.placeRoutine(r, d)))}
          </ul>
        </>
      ) : (
        <button type="button" className="wc-noday-fold" aria-expanded={false} onClick={() => setNodayOpen(true)}>
          <span className="wc-noday-label">No day yet</span>
          <span className="wc-noday-count">{nodayCount}</span>
          <span className="wc-noday-peek">{nodayTitles.slice(0, 2).join(', ')}{nodayCount > 2 ? `, and ${nodayCount - 2} more` : ''}</span>
          <span className="wc-noday-show">{draggingPlaced ? 'Drop here to take its day away' : 'Show'}</span>
        </button>
      )}
    </div>
  )
  // On the desk and tablet, No day yet is one line: a count, and a way into
  // the deck. The titles live on the cards, not on the page. It still takes a
  // day's row dropped on it, to take its day away.
  const nodayLine = (nodayCount > 0 || draggingPlaced) && (
    <div className={`wc-noday wc-noday-line${overShelf ? ' is-over' : ''}`} data-explain="still-to-place" data-explain-label="No day yet" {...shelfDrop}>
      <p className="wc-noday-text">
        {nodayCount > 0 && <span className="wc-noday-n">{nodayCount} without a day</span>}
        {nodayCount > 0 && onPlaceUnplaced && <> · <button type="button" className="canvas-link wc-quiet-link wc-noday-place" onClick={onPlaceUnplaced}>Place them</button></>}
        {draggingPlaced && <span className="wc-noday-hint">Drop here to take its day away</span>}
      </p>
    </div>
  )
  // Last week, said once at the top of the page; the review waits behind it.
  const progressLine = progress && (
    <p className="wc-progress" data-explain="last-week-progress" data-explain-label="Last week">
      {progress.done} done last week · {progress.reviewedOn
        ? <>reviewed {progress.reviewedOn.toLocaleDateString('en-US', { weekday: 'long' })}</>
        : <button type="button" className="canvas-link wc-quiet-link" onClick={progress.onReview}>Review</button>}
    </p>
  )
  const subline = sentence && <span className="wc-tray-aside wc-week-sentence" data-explain="week-sentence" data-explain-label="The week in a sentence">{sentence}</span>
  // This week's weekend, once over, folds to one line: when it was, what
  // happened, what was left (2026-10-05, #137) — room for the days ahead. One
  // still ahead stays open in full: family and household plans live there. A
  // week gone by has no days ahead to make room for, so nothing folds.
  const isWeekend = (d: CanvasDay) => d.date.getDay() === 0 || d.date.getDay() === 6
  const goneWeekend = phone || !isCurrent ? [] : days.filter((d) => isWeekend(d) && d.key < todayKey)
  const stripDays = weekendOpen ? days : days.filter((d) => !goneWeekend.includes(d))
  const shortDay = (d: CanvasDay) => `${d.date.toLocaleDateString('en-US', { weekday: 'short' })} ${d.date.getDate()}`
  const weekendFold = goneWeekend.length > 0 && (
    <button type="button" className="wc-weekend-fold" aria-expanded={weekendOpen} onClick={() => setWeekendOpen((o) => !o)}>
      {/* One label, "This past weekend · Sat 10 – Sun 11 (open)" (Scott,
          2026-10-14): no Open link off at the far right. */}
      <span className="wc-weekend-fold-title">This past weekend</span>
      <span>{goneWeekend.map(shortDay).join(' – ')} <span className="wc-weekend-fold-open">({weekendOpen ? 'fold' : 'open'})</span></span>
      {!weekendOpen && <span className="wc-weekend-fold-events">{goneWeekend.flatMap((d) => d.events).map((ev) => <span key={ev.id}>{ev.title}</span>)}</span>}
    </button>
  )
  // A stay across several days: one bar over the columns it covers, under
  // their headers. Where the days wrap (narrower desks), the line above says it.
  const colOf = new Map(stripDays.map((d, i) => [d.key, i + 1]))
  const bars = spans.flatMap((sp) => {
    if (!sp.from || !sp.to) return []
    const cols = stripDays.filter((d) => d.key >= sp.from! && d.key <= sp.to!).map((d) => colOf.get(d.key)!)
    return cols.length ? [{ sp, start: Math.min(...cols), end: Math.max(...cols) }] : []
  })
  const barTail = (sp: CanvasSpan) => sp.tail?.replace(/^,\s*/, '')
  const subtitleNode = slots?.subline && !phone
    ? createPortal(<>{pastNote}{subline && <span className="wc-subtitle">{subline}</span>}</>, slots.subline)
    : <>{pastNote && <p className="wc-subtitle is-inline">{pastNote}</p>}{subline && <p className="wc-subtitle is-inline">{subline}</p>}</>

  if (phone) {
    const sel = days.find((d) => d.key === selectedKey)
    return (
      <div className="wc wc-phone">
        {subtitleNode}
        {progressLine}
        <div className="wc-daychips" role="group" aria-label="Days">
          {days.map((d) => (
            <button key={d.key} type="button" className={`wc-daychip${d.key === todayKey ? ' is-today' : ''}${pointedDay(d.key) ? ' is-pointed' : ''}`} aria-pressed={d.key === selectedKey}
              aria-label={longDay(d.date)} onClick={() => setChosenDay(d.key)}>
              <span className="wc-daychip-name">{d.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className="wc-daychip-num">{d.date.getDate()}</span>
            </button>
          ))}
        </div>
        {sel && dayColumn(sel)}
        {nodayTray}
        {rhythmNode}
        <div className="wc-done-row">{doneToggle}</div>
      </div>
    )
  }
  return (
    <div className={`wc${drag ? ' is-dragging' : ''}`}>
      {subtitleNode}
      {progressLine}
      <section className="wc-days" aria-label="The days">
        <div className="wc-days-head"><h2 className="wc-label sr-only">The days</h2>{rhythmNode}{doneToggle}</div>
        {spans.length > 0 && (
          <ul className="wc-spans" aria-label="Across these days">
            {spans.map((sp) => (
              <li key={sp.id} className={bars.some((b) => b.sp === sp) ? 'has-bar' : undefined}><button type="button" className="wc-span" onClick={() => writers.open(sp.id)}>
                <span className="wc-span-when">{sp.when}</span> {sp.title}{sp.tail && <span className="wc-span-when">{sp.tail}</span>}
              </button></li>
            ))}
          </ul>
        )}
        {weekendFold}
        <div className={`wc-strip${bars.length ? ' has-bars' : ''}`} style={{ ['--wc-days' as string]: stripDays.length }}>
          {stripDays.map((d, i) => dayColumn(d, i + 1))}
          {bars.length > 0 && (
            <div className="wc-bars" aria-hidden="true">
              {bars.map(({ sp, start, end }) => (
                <button key={sp.id} type="button" tabIndex={-1} className="wc-bar" style={{ gridColumn: `${start} / ${end + 1}` }} onClick={() => writers.open(sp.id)}>
                  <span className="wc-bar-title">{sp.title}</span>{barTail(sp) && <span className="wc-bar-tail">{barTail(sp)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {nodayLine}
      </section>
    </div>
  )
}
