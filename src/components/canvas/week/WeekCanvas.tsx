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
//                    ROW-LANGUAGE.md) and the weather, each only when turned
//                    on; a stay across days as one bar; past days stepped
//                    back and a weekend that is over folded to a line; done
//                    work hidden until "Show done" (useWeekViewPrefs, set
//                    from the header's ⋯ menu in WeekV2).
//   No day yet       what is chosen for this week with no day, under the
//                    days: a few as draggable rows, more folded to one line
//                    (2026-10-14). Inbox, last week and the month's goals
//                    are the planning session's.
//
// Drag a row onto a day to place it, a day's row onto another day to move
// it, back onto the No day yet line to take its day away. While dragging, the
// target day says where it will land.
//
// Within its own day a task drops into the gap between two rows: the order is
// the priority (Task 13, Scott 2026-10-18 — a day shows two, so drag what
// matters to the top). The desk drags natively; touch (the iPad, the wall, a
// phone) presses and holds 250ms, then drags (dnd-kit's TouchSensor, Today's
// constraints), so a tap still opens and a swipe still scrolls.
//
// A timed calendar event drags to another day and keeps its time and length
// (Scott, 2026-10-19: "drag to another day" — the hours grid stays retired).
// An all-day event, one on a calendar that is view-only, or a page that
// cannot write events does not move.
// Every write is the caller's (WeekViewV2 routes them through the canvas
// activity strip with Undo); this component draws and asks.
//
// Phone (<768px): a row of day chips, the chosen day, then No day yet;
// tap opens a chip's task; press and hold orders the day.

import { useContext, useState, type ButtonHTMLAttributes, type DragEvent, type HTMLAttributes, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core'
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
import { CompactWeekRow, type CompactRow, type CompactWeekRowProps } from './CompactWeekList'
import { GiveItADay } from './GiveItADay'
import { dayChipLabel } from './compactWeek'
import type { ShelfGroup } from './weekShelf'
import { foldDay } from '@/lib/week/foldDay'
import { useWeekViewPrefs } from '@/hooks/useWeekViewPrefs'
import { isWeekend } from '@/lib/dateUtils'
import { dragPointerY } from '@/lib/today/dragPointer'
import { gapAt, gapToListIndex } from '@/lib/week/dayReorder'
import { HorizonStrip } from '@/components/canvas/strip/HorizonStrip'
import { TypedAdd } from '@/components/canvas/strip/TypedAdd'
import type { HorizonLanding, HorizonParse } from '@/lib/planning/horizonInput'

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
  /** A calendar event: when it ends, to keep its length on another day. */
  end?: Date
  /** A calendar event that may be dragged to another day (timed, writable). */
  movable?: boolean
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
  /** Within its day, put `task` in the gap at `toIndex` of the day's tasks
   *  (`dayTasks`, as the day reads them, with the orders they have now;
   *  `reorderTasksToIndex`'s terms). Absent: a drop on its own day does nothing. */
  reorderTask?: (task: Task, dayTasks: Task[], toIndex: number) => void
  /** Move a timed calendar event to another day at the same time. Absent:
   *  events do not drag. */
  moveEvent?: (event: CanvasDayItem, day: Date) => void
  /** The strip's month tab: bring a month line onto this week, on a day or
   *  (null) with no day. Absent: the month tab is not drawn. */
  pullLine?: (task: Task, day: Date | null) => void
  /** No day yet: delete a task (the caller offers Undo). Absent: no Delete. */
  deleteTask?: (task: Task) => void
  /** "+ Add to week" / "+ Add to day": a typed sentence, landed by its date. */
  addTyped?: (parse: HorizonParse, landing: HorizonLanding) => Promise<boolean>
}

/** A month line in the strip's month tab. */
export interface StripLine { task: Task; meta: string | null; onWeek: boolean }

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
  /** What Symphony is talking about right now: lit with the teal halo. */
  pointing?: { dates: Set<string>; taskIds: Set<string> } | null
  /** "Place them": opens the deck on this week's unplaced cards. Absent where
   *  the deck may not open; the count then stands alone. */
  onPlaceUnplaced?: () => void
  /** "{n} without a day": how many cards "Place them" deals (WeekViewV2
   *  counts them with the deck's own rule). Absent, the shelf's rows. */
  unplacedCount?: number
  /** Who is looking: a row only they carry shows no face. */
  viewerId?: string
  /** The month above this week, for the strip's month tab. */
  month?: { word: string; href: string; lines: StripLine[] }
}

type Drag = { kind: 'task' | 'routine' | 'occ' | 'event'; id: string; groupKey?: string; fromKey?: string }
type Picker = { key: string } | null
/** A touch drag's row: what a native drag would have written, and the state. */
type Lift = { payload: PlanDragPayload | null; drag: Drag; title: string }

/** A calendar event in flight. Its own type, so the Today pin and the other
 *  plan drop targets never mistake it for a task or routine. */
const EVENT_MIME = 'application/x-symphony-week-event'
type EventDrag = { id: string; from: string }
const isEventDrag = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes(EVENT_MIME)
function readEventDrag(dt: DataTransfer | null): EventDrag | null {
  try {
    const p = JSON.parse(dt?.getData(EVENT_MIME) || 'null') as Partial<EventDrag> | null
    return p && typeof p.id === 'string' && typeof p.from === 'string' ? { id: p.id, from: p.from } : null
  } catch { return null }
}

/** Touch: press and hold, then drag (Today's TodayDragProvider constraints) —
 *  a tap still opens the row and a swipe still scrolls the page. A mouse or
 *  trackpad on a touch device drags after 5px, as on Today. */
const TOUCH_HOLD = { delay: 250, tolerance: 5 }
const MOUSE_MOVE = { distance: 5 }

/** A day (or the No day yet line) a touch drag can land on. */
function DropZone({ id, as: Tag = 'div', ...rest }: { id: string; as?: 'div' | 'section' } & HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined>) {
  const { setNodeRef } = useDroppable({ id })
  return <Tag ref={setNodeRef as (el: HTMLElement | null) => void} {...rest} />
}

/** A day's row that lifts on a held press (touch only; the desk drags natively). */
function LiftableRow<T>({ liftId, lift, ...props }: CompactWeekRowProps<T> & { liftId: string; lift: Lift | null }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: liftId, data: lift ?? undefined, disabled: !lift })
  return (
    <CompactWeekRow {...props} className={`${props.className ?? ''}${isDragging ? ' is-lifted' : ''}`}
      liProps={{ ...props.liProps, ref: setNodeRef, ...(listeners as HTMLAttributes<HTMLLIElement> | undefined) }} />
  )
}

/** A calendar event's row: a button that opens it, dragged natively on the
 *  desk and lifted on a held press on touch. */
function EventButton({ liftId, lift, className, ...rest }: { liftId: string; lift: Lift | null } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: liftId, data: lift ?? undefined, disabled: !lift })
  return <button type="button" ref={setNodeRef} {...(lift ? listeners : undefined)} {...rest} className={`${className ?? ''}${isDragging ? ' is-lifted' : ''}`} />
}

/** More than this many with no day fold to one line under the days. */
const NODAY_FOLD_AT = 4

const longDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

export function WeekCanvas({ weekStart, days, shelf, routinesToPlace, rhythm = [], isCurrent, writers, spans = [], dayDescriptions, members = [], pointing, onPlaceUnplaced, viewerId, month }: WeekCanvasProps) {
  const phone = useMediaQuery('(max-width: 767px)')
  // Touch first (the iPad, the wall): rows lift on a held press instead of the
  // browser's own drag, which a long press would otherwise start too.
  const coarse = useMediaQuery('(pointer: coarse)')
  const touchSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: MOUSE_MOVE }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_HOLD }),
  )
  const slots = useContext(PlanMastheadSlotsContext)
  // The page's view choices, remembered on this device (calm pass 2).
  const prefs = useWeekViewPrefs()
  const showDone = prefs.done
  // The desk and tablet draw the strip on the left (Scott's wireframe,
  // 2026-10-25): the week's own list, its routines and the month above. The
  // days hold what happens on each day, routines included.
  const stripMode = !phone
  const [drag, setDrag] = useState<Drag | null>(null)
  const [overDay, setOverDay] = useState<string | null>(null)
  const [overShelf, setOverShelf] = useState(false)
  // Dragging within its own day: the gap among the shown task rows it would land in.
  const [overGap, setOverGap] = useState<{ key: string; gap: number } | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const [picker, setPicker] = useState<Picker>(null)
  const [weekendOpen, setWeekendOpen] = useState(false)
  const [nodayOpen, setNodayOpen] = useState<boolean | null>(null)
  // The typed add above the days: for the week, or for one day.
  const [composer, setComposer] = useState<{ key: string | null } | null>(null)
  // In the strip, a row's when-chips open under it on asking (the floating
  // hover bar overran the narrow strip and covered the rows above).
  const [whenOpen, setWhenOpen] = useState<string | null>(null)
  // The days opened past their few ("+3 more"), by key.
  const [openDays, setOpenDays] = useState<ReadonlySet<string>>(() => new Set())
  const toggleDayOpen = (key: string) => setOpenDays((was) => {
    const next = new Set(was)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

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
  const endDrag = () => { setDrag(null); setOverDay(null); setOverShelf(false); setOverGap(null); setLifted(null) }
  const startDrag = (ev: DragEvent, payload: PlanDragPayload, d: Drag) => {
    writePlanDrag(ev.dataTransfer, payload)
    setDrag(d); setPicker(null)
  }
  const monthLine = (id: string) => month?.lines.find((l) => l.task.id === id) ?? null
  const dropOnDay = (day: CanvasDay, p: PlanDragPayload) => {
    endDrag()
    if (p.kind === 'task') {
      const line = monthLine(p.id)
      // A goal is never given a day (nested horizons): only its next actions are.
      if (line && writers.pullLine && !shelfTasks.has(p.id) && !dayTask(p.id)) { if (!line.task.isGoal) writers.pullLine(line.task, day.date); return }
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
  const dayEvent = (id: string, key: string) => days.find((d) => d.key === key)?.events.find((ev) => ev.id === id) ?? null
  const dropEventOnDay = (day: CanvasDay, e: EventDrag) => {
    endDrag()
    const ev = dayEvent(e.id, e.from)
    if (ev?.movable && e.from !== day.key) writers.moveEvent?.(ev, day.date)
  }
  const startEventDrag = (ev: DragEvent, item: CanvasDayItem, key: string) => {
    ev.dataTransfer.setData(EVENT_MIME, JSON.stringify({ id: item.id, from: key } satisfies EventDrag))
    ev.dataTransfer.setData('text/plain', item.title)
    ev.dataTransfer.effectAllowed = 'move'
    setDrag({ kind: 'event', id: item.id, fromKey: key }); setPicker(null)
  }
  // ── order within a day ────────────────────────────────────────────────
  // Only a task orders, within the day it is on; events and routines keep
  // their places. The gap is read from the shown task rows (a folded day
  // shows two) and turned into a place among all the day's tasks.
  const reorders = (d: Drag | null, key: string) => !!writers.reorderTask && d?.kind === 'task' && d.fromKey === key
  const orderRows = (section: Element) => [...section.querySelectorAll<HTMLElement>('.wc-items li[data-order-id]')]
  const gapIn = (section: Element, y: number) => gapAt(y, orderRows(section).map((r) => r.getBoundingClientRect()))
  const showGap = (key: string, section: Element, y: number) => {
    const gap = gapIn(section, y)
    if (overGap?.key !== key || overGap.gap !== gap) setOverGap({ key, gap })
  }
  const reorderAt = (day: CanvasDay, taskId: string, section: Element, y: number) => {
    const placed = dayTask(taskId)
    if (!placed?.item.task || placed.day.key !== day.key) return
    const dayTasks = tasksOf(dayLists(day).all)
    const to = gapToListIndex(gapIn(section, y), orderRows(section).map((r) => r.dataset.orderId!), dayTasks.map((t) => t.id))
    writers.reorderTask?.(placed.item.task, dayTasks, to)
  }
  const dayDrop = (day: CanvasDay) => ({
    onDragOver: (e: DragEvent) => {
      if (!isPlanDrag(e.dataTransfer) && !isEventDrag(e.dataTransfer)) return
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'
      if (overDay !== day.key) setOverDay(day.key)
      if (reorders(drag, day.key)) showGap(day.key, e.currentTarget, e.clientY)
      else if (overGap) setOverGap(null)
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setOverDay((k) => (k === day.key ? null : k))
    },
    onDrop: (e: DragEvent) => {
      const moved = readEventDrag(e.dataTransfer)
      if (moved) { e.preventDefault(); e.stopPropagation(); dropEventOnDay(day, moved); return }
      const p = readPlanDrag(e.dataTransfer)
      if (!p) { endDrag(); return }
      e.preventDefault(); e.stopPropagation()
      const placed = p.kind === 'task' ? dayTask(p.id) : null
      if (writers.reorderTask && placed?.day.key === day.key) { endDrag(); reorderAt(day, p.id, e.currentTarget, e.clientY); return }
      dropOnDay(day, p)
    },
  })
  // ── touch: press and hold, then drag ──────────────────────────────────
  const liftOf = (e: { active: { data: { current?: unknown } } }) => (e.active.data.current ?? null) as Lift | null
  const sectionOf = (key: string) => document.querySelector(`[data-day-key="${key}"]`)
  const onTouchStart = (e: DragStartEvent) => {
    const l = liftOf(e)
    if (!l) return
    setDrag(l.drag); setPicker(null); setLifted(l.title)
  }
  const onTouchMove = (e: DragMoveEvent) => {
    const l = liftOf(e)
    const over = e.over ? String(e.over.id) : null
    const y = dragPointerY(e)
    setOverShelf(over === 'noday')
    const key = over?.startsWith('day:') ? over.slice(4) : null
    if (overDay !== key) setOverDay(key)
    const section = key ? sectionOf(key) : null
    if (key && section && y != null && reorders(l?.drag ?? null, key)) showGap(key, section, y)
    else if (overGap) setOverGap(null)
  }
  const onTouchEnd = (e: DragEndEvent) => {
    const l = liftOf(e)
    const over = e.over ? String(e.over.id) : null
    const y = dragPointerY(e)
    endDrag()
    if (!l || !over) return
    if (l.drag.kind === 'event') {
      const day = days.find((d) => `day:${d.key}` === over)
      if (day && l.drag.fromKey) dropEventOnDay(day, { id: l.drag.id, from: l.drag.fromKey })
      return
    }
    if (!l.payload) return
    if (over === 'noday') {
      const placed = l.drag.kind === 'task' && l.drag.fromKey ? dayTask(l.payload.id) : null
      if (placed?.item.task) writers.unplaceTask(placed.item.task)
      return
    }
    const day = days.find((d) => `day:${d.key}` === over)
    if (!day) return
    const section = sectionOf(day.key)
    if (reorders(l.drag, day.key)) { if (section && y != null) reorderAt(day, l.payload.id, section, y); return }
    dropOnDay(day, l.payload)
  }
  const withTouch = (node: ReactNode) => (
    <DndContext sensors={touchSensors} collisionDetection={pointerWithin}
      onDragStart={onTouchStart} onDragMove={onTouchMove} onDragEnd={onTouchEnd} onDragCancel={endDrag}>
      {node}
      {typeof document !== 'undefined' && createPortal(
        <DragOverlay dropAnimation={null}>{lifted && <div className="wc-lift">{lifted}</div>}</DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
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

  // A few things a day (foldDay, calm pass 2): the calendar events always
  // show, and beside them two things, timed or not, routines included, in the
  // day's order (the top two are the priority). A row Symphony is proposing or
  // pointing at stays in sight. The rest wait behind "+N more".
  const dayLists = (day: CanvasDay) => {
    // A routine on a day shows on that day (2026-10-26: dragging one onto
    // Monday left the grid unchanged); the strip's Routines tab is the
    // week's overview of them. Every-day and weekday ones were already
    // lifted into the rhythm line before the days came here.
    const all = day.items.filter((it) => showDone || !it.completed)
    const fold = foldDay([
      ...day.events.map(() => ({ event: true, it: null })),
      ...all.map((it) => ({ event: false, pinned: !!it.proposed || pointedTask(it.task?.id), it })),
    ])
    const shown = openDays.has(day.key) ? all : fold.shown.flatMap((x) => (x.it ? [x.it] : []))
    return { all, fold, shown }
  }
  const tasksOf = (items: CanvasDayItem[]) => items.flatMap((it) => (it.task && !it.proposed ? [it.task] : []))

  // ── the shelf ──────────────────────────────────────────────────────────
  const pick = (rowKey: string, title: string, onPick: (d: Date) => void, current?: string) => (picker?.key === rowKey && (
    <GiveItADay title={title} days={dates} inline={phone} current={current} describe={dayDescriptions} label="Give it a day"
      onPick={(d) => { setPicker(null); onPick(d) }} onClose={() => setPicker(null)} />
  ))
  // ── the days ───────────────────────────────────────────────────────────
  // Who carries it, a glance from the title (ROW-LANGUAGE: people); nothing
  // for an id the household doesn't know, and nothing when it is only the
  // viewer's own (Friday session: names only when not yours).
  const peopleOf = (it: CanvasDayItem) => {
    if (viewerId && it.people?.length === 1 && it.people[0] === viewerId) return null
    const who = (it.people ?? []).flatMap((id) => { const m = memberById.get(id); return m ? [m] : [] })
    return who.length > 0 && (
      <span className="wk-people wc-people" aria-label={who.map((m) => m.name).join(', ')}>
        {who.slice(0, 3).map((m) => <AssigneeAvatar key={m.id} member={m as FamilyMember} size="sm" className="wc-avatar" />)}
      </span>
    )
  }
  const dayRow = (it: CanvasDayItem, day: CanvasDay, order?: { index: number; count: number }) => {
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
    // The gap a drag within this day would land in, drawn as a line.
    const gap = order && overGap?.key === day.key ? overGap.gap : null
    const gapCls = gap === null ? '' : gap === order!.index ? ' is-gap-above' : gap === order!.count && order!.index === order!.count - 1 ? ' is-gap-below' : ''
    // Touch: a day's own task or routine lifts on a held press (not "Sometime").
    const lift: Lift | null = !coarse || !order || it.completed ? null
      : it.task ? { payload: { kind: 'task', id: it.task.id, date: day.key, title: it.title }, drag: { kind: 'task', id: it.task.id, fromKey: day.key }, title: it.title }
        : it.routineId ? { payload: { kind: 'routine', id: it.routineId, date: day.key, title: it.title }, drag: { kind: 'occ', id: it.routineId, fromKey: day.key }, title: it.title }
          : null
    return (
      <LiftableRow key={key} liftId={key} lift={lift} row={row} className={`wc-dayrow${it.kind === 'routine' ? ' is-routine' : ''}${pointedTask(it.task?.id) ? ' is-pointed' : ''}${gapCls}`}
        liProps={{ 'data-order-id': order && it.task ? it.task.id : undefined }}
        onComplete={(x) => (x.task ? writers.toggleTask(x.task) : writers.toggleRoutine(x, day.date))}
        onOpen={(x) => writers.open(x.id)}
        onDragStart={phone || coarse ? undefined : (x, ev) => x.task
          ? startDrag(ev, { kind: 'task', id: x.task.id, date: day.key, title: x.title }, { kind: 'task', id: x.task.id, fromKey: day.key })
          : x.routineId ? startDrag(ev, { kind: 'routine', id: x.routineId, date: day.key, title: x.title }, { kind: 'occ', id: x.routineId, fromKey: day.key }) : undefined}
        onDragEnd={endDrag}
        under={peopleOf(it)} />
    )
  }
  const dayColumn = (day: CanvasDay, col?: number) => {
    const { all: allItems, fold, shown: items } = dayLists(day)
    const dayOpen = openDays.has(day.key)
    // The shown task rows, numbered for the gap marker.
    const orderable = items.filter((it) => it.task && !it.proposed)
    const orderOf = (it: CanvasDayItem) => { const index = orderable.indexOf(it); return index === -1 ? undefined : { index, count: orderable.length } }
    const sometime = (day.sometime ?? []).filter((it) => showDone || !it.completed)
    const specials = day.specials ?? []
    const empty = !day.events.length && !allItems.length && !sometime.length && !specials.length
    const over = overDay === day.key
    // Within its own day a drag orders: the gap shows, not "Drop on …".
    const ordering = over && reorders(drag, day.key)
    // A day gone by steps back; today and the days ahead stay at full strength.
    const gone = day.key < todayKey
    return (
      <DropZone as="section" id={`day:${day.key}`} key={day.key} className={`wc-day${day.key === todayKey ? ' is-today' : ''}${gone ? ' is-past' : ''}${over && !ordering ? ' is-over' : ''}${ordering ? ' is-ordering' : ''}${empty ? ' is-empty' : ''}${pointedDay(day.key) ? ' is-pointed' : ''}`}
        style={col ? { gridColumn: col } : undefined}
        aria-label={longDay(day.date)} data-testid={`journal-day-${day.key}`} data-day-key={day.key} {...dayDrop(day)}>
        <header className="wc-dayhead">
          <span className="wc-dayname">{day.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
          <span className="wc-daynum">{day.date.getDate()}</span>
          {day.key === todayKey && <span className="wc-todaytag">Today</span>}
          {prefs.weather && day.weather && <span className="wc-weather">{day.weather}</span>}
        </header>
        <div className="wc-daybody">
        {over && !ordering && <p className="wc-drop-hint" aria-live="polite">Drop on {dayChipLabel(day.date)}</p>}
        {specials.length > 0 && (
          <p className="today-specials wc-specials">
            {specials.map((sp) => <span key={sp.who} className="today-special-chip"><span>{sp.who}</span>{sp.special}</span>)}
          </p>
        )}
        {day.events.length > 0 && (
          <ul className="wc-events" aria-label={`${day.date.toLocaleDateString('en-US', { weekday: 'long' })} events`}>
            {day.events.map((ev) => {
              const movable = !!writers.moveEvent && !!ev.movable && !phone
              const lift: Lift | null = movable && coarse ? { payload: null, drag: { kind: 'event', id: ev.id, fromKey: day.key }, title: ev.title } : null
              return (
                <li key={ev.id}>
                  <EventButton liftId={`${day.key}:${ev.id}`} lift={lift} className={`wc-event${movable ? ' is-movable' : ''}`} onClick={() => writers.open(ev.id)}
                    draggable={movable && !coarse} onDragStart={movable && !coarse ? (e) => startEventDrag(e, ev, day.key) : undefined}
                    onDragEnd={movable && !coarse ? endDrag : undefined}>
                    {ev.time && <span className="wc-event-time">{formatTimeCompact(ev.time)}</span>}
                    <span className="wc-event-title">{ev.title}{ev.subtitle && <span className="wc-event-sub">{ev.subtitle}</span>}</span>
                  </EventButton>
                </li>
              )
            })}
          </ul>
        )}
        {items.length > 0 && <ul className="cw-rows wc-items" aria-label={`${day.date.toLocaleDateString('en-US', { weekday: 'long' })} entries`}>{items.map((it) => dayRow(it, day, orderOf(it)))}</ul>}
        {fold.hidden > 0 && (
          <button type="button" className="canvas-link wc-quiet-link wc-more" aria-expanded={dayOpen} onClick={() => toggleDayOpen(day.key)}>
            {dayOpen ? 'Show less' : `+${fold.hidden} more`}
          </button>
        )}
        {!stripMode && (day.dinners ?? []).length > 0 && (
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
        {prefs.freeTime && day.free && <p className="wk-free">{day.free}</p>}
        {stripMode && writers.addTyped && (
          <button type="button" className="canvas-link wc-quiet-link wc-addday" onClick={() => setComposer({ key: day.key })}>+ Add to day</button>
        )}
        </div>
      </DropZone>
    )
  }
  // Routines that happen every day are written once above the days; "Show
  // daily routines in each day" (the header's ⋯ menu) puts them back in each
  // day, and then the band is empty.
  const shownLines = rhythm.filter((r) => r.items.length)
  // Calm pass 2: one quiet line of groups — "Every day 7:30p Kids bedtime ·
  // Weekdays 6:45a School morning · Mon–Thu 5:15p Pick up from FFG · …".
  const rhythmNode = shownLines.length > 0 && (
    <div className="wc-rhythm">
      <p>
        {shownLines.map((r, li) => (
          <span key={r.label} className="wc-rhythm-group">{li > 0 && ' · '}<span className="wc-rhythm-label">{r.label}</span>{' '}
            {r.items.map((it, i) => <span key={it.openId}>{i > 0 && ' · '}<button type="button" className="wc-rhythm-item" onClick={() => writers.open(it.openId)}>{it.title}</button></span>)}
          </span>
        ))}
      </p>
    </div>
  )
  // A past week says so, with the way back (Scott, 2026-10-12: a page left
  // open showed last week as if it were this one).
  const past = !isCurrent && weekStart.getTime() < weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn).getTime()
  const pastNote = past && <span className="wc-past" role="note">
    <b>Past week</b> · <Link className="canvas-link" to="/week?view=alongside">Back to this week</Link>
  </span>
  const unplaced = shelf.flatMap((g) => g.rows.map((r) => r.task))
  // Dragging a day's task: the line shows (even empty) so it can be dropped back.
  const draggingPlaced = drag?.kind === 'task' && !!drag.fromKey
  // A row: the title is what the pointer grabs (desktop) and what opens the
  // item; on the phone a + beside it gives the day, since touch can't drag.
  const nodayRow = (kind: 'task' | 'routine', id: string, title: string, onPlace: (d: Date) => void, onComplete?: () => void, triage?: ReactNode) => {
    const lit = kind === 'task' && pointedTask(id)
    const key = `noday:${kind}:${id}`
    return (
      <li key={key} className={`wc-noday-chip${kind === 'routine' ? ' is-routine' : ''}${lit ? ' is-pointed' : ''}${stripMode && whenOpen === key ? ' is-when-open' : ''}`}>
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
        {triage && stripMode && (
          <button type="button" className="hs-when" aria-expanded={whenOpen === key} aria-label={`When for ${title}`}
            onClick={() => setWhenOpen(whenOpen === key ? null : key)}>When ▾</button>
        )}
        {triage && (!stripMode || whenOpen === key) && <div className="wc-noday-actions" role="group" aria-label={`When for ${title}`}>{triage}</div>}
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
    <DropZone id="noday" className={`wc-noday${overShelf ? ' is-over' : ''}${nodayShown ? ' is-open' : ''}`} data-explain="still-to-place" data-explain-label="No day yet" {...shelfDrop}>
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
                onDelete={writers.deleteTask ? () => writers.deleteTask!(t) : undefined}
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
    </DropZone>
  )
  // This week's weekend, once over, folds to one line: when it was, what
  // happened, what was left (2026-10-05, #137) — room for the days ahead. One
  // still ahead stays open in full: family and household plans live there. A
  // week gone by has no days ahead to make room for, so nothing folds.
  const goneWeekend = phone || !isCurrent ? [] : days.filter((d) => isWeekend(d.date) && d.key < todayKey)
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
  // The weekend's days are wider: family and household plans live there. Set
  // from the days themselves, so a Saturday-first week widens its first two.
  const stripCols = stripDays.map((d) => (isWeekend(d.date) ? 'minmax(0,1.5fr)' : 'minmax(0,1fr)')).join(' ')
  const barTail = (sp: CanvasSpan) => sp.tail?.replace(/^,\s*/, '')
  // Last week's progress and "Today: …" are the header's fact line (WeekV2,
  // calm pass 2); the canvas keeps only a past week's note.
  const subtitleNode = slots?.subline && !phone
    ? pastNote && createPortal(pastNote, slots.subline)
    : pastNote && <p className="wc-subtitle is-inline">{pastNote}</p>

  if (phone) {
    const sel = days.find((d) => d.key === selectedKey)
    return withTouch(
      <div className={`wc wc-phone${drag ? ' is-dragging' : ''}`}>
        {subtitleNode}
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
      </div>,
    )
  }
  // ── the strip (desk and tablet) ───────────────────────────────────────
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
  const dayShort = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  // The week's own list: what has no day yet. A day's task dropped here loses its day.
  const weekTab = (
    <>
      <DropZone id="noday" className={`hs-drop${overShelf ? ' is-over' : ''}`} data-explain="still-to-place" data-explain-label="No day yet" {...shelfDrop}>
        <p className="hs-eyebrow">No day yet{unplaced.length > 0 ? ` · ${unplaced.length}` : ''}</p>
        {draggingPlaced && <p className="hs-row-meta">Drop here to take its day away</p>}
        {unplaced.length > 0
          ? <ul className="wc-noday-chips hs-noday" aria-label="No day yet">
            {unplaced.map((t) => nodayRow('task', t.id, t.title, (d) => writers.placeTask(t, d), () => writers.toggleTask(t), writers.triageTask && (
              <TriageWhenMenu contained
                onPick={(when) => { setWhenOpen(null); writers.triageTask!(t, when) }}
                onPickDate={writers.scheduleTask ? (at, allDay) => writers.scheduleTask!(t, at, allDay) : undefined}
                onDelete={writers.deleteTask ? () => { setWhenOpen(null); writers.deleteTask!(t) } : undefined}
              />
            )))}
          </ul>
          : !draggingPlaced && <p className="hs-empty">Everything on this week has a day.</p>}
      </DropZone>
      {unplaced.length > 0 && <p className="hs-row-meta">Drag one onto a day.{onPlaceUnplaced && <> Or <button type="button" className="canvas-link wc-quiet-link" onClick={onPlaceUnplaced}>place them one at a time</button>.</>}</p>}
      {writers.addTyped && <button type="button" className="hs-add" onClick={() => setComposer({ key: null })}>+ Add to week</button>}
    </>
  )
  // The week's routines: the ones that run on a day or two of it, by day, done
  // from here; every-day ones are on Today. A row drags to another day.
  const routineGroups = days.map((d) => ({ day: d, items: d.items.filter((it) => it.kind === 'routine' && !!it.routineId && !it.proposed) }))
    .filter((g) => g.items.length > 0)
  const routineCount = routineGroups.reduce((n, g) => n + g.items.length, 0) + routinesToPlace.length
  const everyDay = rhythm.flatMap((r) => r.items.map((it) => it.title))
  const routinesTab = (
    <>
      {routineGroups.length === 0 && routinesToPlace.length === 0 && <p className="hs-empty">No weekly routines this week.</p>}
      {routineGroups.map(({ day, items }) => (
        <section key={day.key} className="hs-group" aria-label={`${longDay(day.date)} routines`}>
          <h3 className={`hs-eyebrow${day.key === todayKey ? ' is-today' : ''}`}>{dayShort(day.date)}{day.key === todayKey ? ' · today' : ''}</h3>
          <ul className="hs-list">
            {items.map((it) => (
              <li key={`${day.key}:${it.id}`} className={`hs-row${it.completed ? ' is-done' : ''}`} draggable={!coarse && !it.completed}
                onDragStart={(ev) => startDrag(ev, { kind: 'routine', id: it.routineId!, date: day.key, title: it.title }, { kind: 'occ', id: it.routineId!, fromKey: day.key })}
                onDragEnd={endDrag}>
                <button type="button" className="hs-check" aria-pressed={it.completed} aria-label={`${it.completed ? 'Reopen' : 'Done:'} ${it.title}`} onClick={() => writers.toggleRoutine(it, day.date)} />
                <span className="hs-row-body">
                  <button type="button" className="hs-row-title" onClick={() => writers.open(it.id)}>
                    {it.time && <span className="hs-row-time">{formatTimeCompact(it.time)}</span>}{it.title}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {routinesToPlace.length > 0 && (
        <section className="hs-group" aria-label="Sometime this week">
          <h3 className="hs-eyebrow">Sometime this week</h3>
          <ul className="hs-list">
            {routinesToPlace.map((r) => (
              <li key={r.id} className="hs-row" draggable={!coarse}
                onDragStart={(ev) => startDrag(ev, { kind: 'routine', id: r.id, date: localYmd(weekStart), title: r.title }, { kind: 'routine', id: r.id })}
                onDragEnd={endDrag}>
                <span className="hs-row-body">
                  <button type="button" className="hs-row-title" onClick={() => writers.open(`routine-${r.id}`)}>{r.title}</button>
                  <span className="hs-row-meta">Drag onto a day</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {everyDay.length > 0 && <p className="hs-note">Every-day routines are on <Link to="/today">Today</Link>: {everyDay.slice(0, 3).join(', ')}{everyDay.length > 3 ? ` and ${everyDay.length - 3} more` : ''}.</p>}
    </>
  )
  // The month above: its open lines, brought onto this week by drag or "→ Week".
  const monthTab = month && writers.pullLine && (
    <>
      <p className="hs-eyebrow">{month.word} · still open</p>
      {month.lines.length === 0 && <p className="hs-empty">Nothing open on {month.word}.</p>}
      <ul className="hs-list">
        {month.lines.map((l) => (
          <li key={l.task.id} className="hs-row" draggable={!coarse && !l.onWeek && !l.task.isGoal}
            onDragStart={(ev) => startDrag(ev, { kind: 'task', id: l.task.id, date: localYmd(weekStart), title: l.task.title }, { kind: 'task', id: l.task.id })}
            onDragEnd={endDrag}>
            <span className="hs-row-body">
              <button type="button" className="hs-row-title" onClick={() => writers.open(`task-${l.task.id}`)}>{l.task.title}</button>
              {(l.onWeek || l.meta) && <span className={`hs-row-meta${l.onWeek ? ' is-here' : ''}`}>{l.onWeek ? 'On this week' : l.meta}</span>}
            </span>
            {!l.onWeek && <button type="button" className="hs-row-go" aria-label={`Bring ${l.task.title} onto this week`} onClick={() => writers.pullLine!(l.task, null)}>→ Week</button>}
          </li>
        ))}
      </ul>
      <Link to={month.href} className="canvas-link hs-add">Open {month.word} →</Link>
    </>
  )
  const composerDay = composer?.key ? days.find((d) => d.key === composer.key) : undefined
  const composerNode = composer && writers.addTyped && (
    <TypedAdd key={composer.key ?? 'week'} label={composerDay ? `Add to ${dayShort(composerDay.date)}` : 'Add to this week'}
      period={{ start: weekStart, end: weekEnd }} periodWord="this week" fallbackDay={composerDay?.date}
      onSave={async (parse, landing) => { const ok = await writers.addTyped!(parse, landing); if (ok) setComposer(null); return ok }}
      onCancel={() => setComposer(null)} />
  )
  // Dinner, one row across the days, so the meal plan reads straight across.
  const dinnerRow = stripDays.some((d) => (d.dinners ?? []).length > 0) && (
    <div className="wc-dinners" style={{ gridTemplateColumns: stripCols }} aria-label="Dinners">
      {stripDays.map((d) => (
        <p key={d.key} className="wc-dinner">
          {(d.dinners ?? []).length > 0 && <><span className="wc-dinner-label">Dinner</span>{' '}
            {d.dinners!.map((x, i) => <span key={x.id}>{i > 0 && ' · '}{x.href
              ? <Link to={x.href} className="wc-rhythm-item">{x.label}</Link>
              : <button type="button" className="wc-rhythm-item" onClick={() => writers.open(x.id)}>{x.label}</button>}</span>)}</>}
        </p>
      ))}
    </div>
  )
  const nodayN = unplaced.length
  return withTouch(
    <div className={`wc wc-with-strip hs-layout${drag ? ' is-dragging' : ''}`}>
      <HorizonStrip id="week" label="Week strip" railLabel={`This week${nodayN ? ` · ${nodayN} without a day` : ''}`}
        tabs={[
          { id: 'week', label: 'Week', count: nodayN || undefined, content: weekTab },
          { id: 'routines', label: 'Routines', count: routineCount || undefined, content: routinesTab },
          ...(monthTab ? [{ id: 'month', label: month!.word, content: monthTab }] : []),
        ]} />
      <div className="hs-main">
      {subtitleNode}
      {composerNode}
      <section className="wc-days" aria-label="The days">
        <h2 className="wc-label sr-only">The days</h2>
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
        <div className={`wc-strip${bars.length ? ' has-bars' : ''}`} style={{ ['--wc-days' as string]: stripDays.length, gridTemplateColumns: stripCols }}>
          {stripDays.map((d, i) => dayColumn(d, i + 1))}
          {bars.length > 0 && (
            <div className="wc-bars" aria-hidden="true" style={{ gridTemplateColumns: stripCols }}>
              {bars.map(({ sp, start, end }) => (
                <button key={sp.id} type="button" tabIndex={-1} className="wc-bar" style={{ gridColumn: `${start} / ${end + 1}` }} onClick={() => writers.open(sp.id)}>
                  <span className="wc-bar-title">{sp.title}</span>{barTail(sp) && <span className="wc-bar-tail">{barTail(sp)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {dinnerRow}
      </section>
      </div>
    </div>,
  )
}
