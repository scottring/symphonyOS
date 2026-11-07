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
//   Sometime this    the week's first column, before its first day (Scott,
//   week             2026-11-04: "why the duplicate ribbons?" — the strip
//                    is gone, the month's fold is the only band): what is
//                    chosen for this week with no day (When ▾, drag onto a
//                    day), the weekly routines that still need a day, and
//                    "+ Add to week". Routines with a day are on their day.
//                    On the phone it is the first section above the days.
//   The month        folded beside the days (paper-style horizons, Scott
//                    2026-11-04): a read-only sheet hinged at the days' left
//                    edge (PaperFold + AboveSheet). Nothing on it moves onto
//                    the week: no "→ Week", no drag onto a day.
//
// Drag a row onto a day to place it, a day's row onto another day to move
// it, back onto Sometime this week to take its day away. While dragging, the
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
// Phone (<768px): Sometime this week, a row of day chips, then the chosen
// day; tap opens a chip's task; press and hold orders the day.

import { useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type DragEvent, type HTMLAttributes, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import type { Task, TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { MultiAssigneeDropdown } from '@/components/family/MultiAssigneeDropdown'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { assigneesOf } from '@/lib/planning/v2/planV2'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { Link } from 'react-router-dom'
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
import { TypedAdd } from '@/components/canvas/strip/TypedAdd'
import { WriteLine } from '@/components/plan/fold/WriteLine'
import { PaperFold } from '@/components/plan/fold/PaperFold'
import { AboveSheet, LookSheet } from '@/components/plan/fold/AboveSheet'
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
  /** Who carries it (household member ids); a calendar event's, for its
   *  people picker only (no faces on an event chip). */
  people?: string[]
  /** A calendar event's space (its override, else its calendar's), for its
   *  space picker. */
  context?: TaskContext | null
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
  /** No day yet: delete a task (the caller offers Undo). Absent: no Delete. */
  deleteTask?: (task: Task) => void
  /** A task's space (Work, Family, Personal), from its row. Absent: no picker. */
  setTaskContext?: (task: Task, context: TaskContext | undefined) => void
  /** Who carries a task, from its row (every id; none unassigns). Absent: no picker. */
  assignTask?: (task: Task, memberIds: string[]) => void
  /** A calendar event's space, from its chip. Absent: no picker. */
  setEventContext?: (event: CanvasDayItem, context: TaskContext | undefined) => void
  /** Who goes to a calendar event, from its chip. Absent: no picker. */
  assignEvent?: (event: CanvasDayItem, memberIds: string[]) => void
  /** "+ Add to week" / "+ Add to day": a typed sentence, landed by its date. */
  addTyped?: (parse: HorizonParse, landing: HorizonLanding) => Promise<boolean>
}

/** The month above this week, for reading beside the days: its open lines,
 *  titles only, and how many are done. */
export interface WeekMonthSheet {
  /** "November": the edge's name and the sheet's title. */
  word: string
  /** "Month · Nov 1 – 30". */
  kicker: string
  rows: { id: string; title: string }[]
  doneCount: number
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
  /** The month above this week, folded beside the days for reading. Absent
   *  (a week looked back on): no fold. */
  month?: WeekMonthSheet
  /** A guided session's step (2026-11-04) drives the month's fold: the
   *  step opens it (`drive`), and the look back turns it to last week with
   *  its choices (`look`). Nothing is remembered. */
  fold?: { stepId?: string | null; drive?: { above?: boolean }; look?: ReactNode | null; write?: boolean }
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

/** A day (or Sometime this week) a touch drag can land on. */
function DropZone({ id, as: Tag = 'div', ...rest }: { id: string; as?: 'div' | 'section' } & HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined>) {
  const { setNodeRef } = useDroppable({ id })
  return <Tag ref={setNodeRef as (el: HTMLElement | null) => void} {...rest} />
}

/** Newcomers: ids that came in since the page opened (or since the week
 *  shown changed). `fresh` marks them for a moment so they slide in;
 *  `landed` keeps every one for the visit, so a day can keep what was just
 *  put on it in sight rather than behind "+N more" (Scott, 2026-11-07). */
function useNewcomers(scope: string, ids: string[]): { fresh: ReadonlySet<string>; landed: ReadonlySet<string> } {
  const seen = useRef<{ scope: string; ids: Set<string> } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())
  const [landed, setLanded] = useState<{ scope: string; ids: ReadonlySet<string> }>(() => ({ scope, ids: new Set() }))
  const key = ids.join('|')
  useEffect(() => {
    const now = key ? key.split('|') : []
    if (!seen.current || seen.current.scope !== scope) { seen.current = { scope, ids: new Set(now) }; return }
    const added = now.filter((id) => !seen.current!.ids.has(id))
    now.forEach((id) => seen.current!.ids.add(id))
    if (!added.length) return
    setFresh(new Set(added))
    setLanded((was) => ({ scope, ids: new Set([...(was.scope === scope ? was.ids : []), ...added]) }))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFresh(new Set()), 1800)
  }, [scope, key])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return { fresh, landed: landed.scope === scope ? landed.ids : EMPTY_IDS }
}
const EMPTY_IDS: ReadonlySet<string> = new Set()

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

const longDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

export function WeekCanvas({ weekStart, days, shelf, routinesToPlace, rhythm = [], isCurrent, writers, spans = [], dayDescriptions, members = [], pointing, onPlaceUnplaced, viewerId, month, fold: session }: WeekCanvasProps) {
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
  const [drag, setDrag] = useState<Drag | null>(null)
  const [overDay, setOverDay] = useState<string | null>(null)
  const [overShelf, setOverShelf] = useState(false)
  // Dragging within its own day: the gap among the shown task rows it would land in.
  const [overGap, setOverGap] = useState<{ key: string; gap: number } | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const [picker, setPicker] = useState<Picker>(null)
  const [weekendOpen, setWeekendOpen] = useState(false)
  // The typed add above the days: for the week, or for one day.
  const [composer, setComposer] = useState<{ key: string | null } | null>(null)
  // A writing step of a guided session (Choose this week's tasks) puts the
  // pencil on the week's own line. On the desk that line is always open at
  // the top of Sometime this week (the coach focuses it); the phone has no
  // such line, so its typed add opens instead.
  const writeStep = !!session?.write
  const [wroteFor, setWroteFor] = useState(false)
  if (writeStep !== wroteFor) {
    setWroteFor(writeStep)
    if (writeStep && phone && !composer) setComposer({ key: null })
  }
  // In Sometime this week, a row's when-chips open under it on asking (a
  // floating hover bar would overrun the narrow column and cover the rows above).
  const [whenOpen, setWhenOpen] = useState<string | null>(null)
  // The days opened past their few ("+3 more"), by key.
  const [openDays, setOpenDays] = useState<ReadonlySet<string>>(() => new Set())
  const toggleDayOpen = (key: string) => setOpenDays((was) => {
    const next = new Set(was)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  // What lands on a day while the page is open stays in sight there, past
  // the day's few, and slides in (Scott, 2026-11-07: a card dragged onto a
  // full day vanished behind "+N more").
  const { fresh: dayFresh, landed: dayLanded } = useNewcomers(localYmd(weekStart), days.flatMap((d) => d.items.map((it) => `${d.key}:${it.id}`)))
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
  // pointing at stays in sight. The rest wait behind "+N more", in a planning
  // session too: the week never changes shape in one (final review, 2026-11-04).
  const dayLists = (day: CanvasDay) => {
    // A routine on a day shows on that day, with its time and its check
    // (2026-10-26: dragging one onto Monday left the grid unchanged; the
    // strip that also listed them by day is gone, 2026-11-04). Every-day and
    // weekday ones were already lifted into the rhythm line before the days
    // came here.
    const all = day.items.filter((it) => showDone || !it.completed)
    const fold = foldDay([
      ...day.events.map(() => ({ event: true, it: null })),
      ...all.map((it) => ({ event: false, pinned: !!it.proposed || pointedTask(it.task?.id) || dayLanded.has(`${day.key}:${it.id}`), it })),
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
  // A task's space and people, on its row (Scott, 2026-11-05: the Week's
  // rows had lost them). With a pointer they come up under the title on
  // hover or focus, standing in for the faces; on touch they stay.
  // Calendar events get the same two (Scott, 2026-11-05), under their chip.
  const tools = (title: string, context: TaskContext | null, people: string[],
    onContext?: (c: TaskContext | undefined) => void, onPeople?: (ids: string[]) => void) => {
    const who = onPeople && members.length > 0
    if (!onContext && !who) return null
    return (
      <span className="wc-tools" onPointerDown={(e) => e.stopPropagation()}>
        {onContext && <ContextPicker size="sm" value={context} onChange={onContext} />}
        {who && (
          <MultiAssigneeDropdown members={members as FamilyMember[]} selectedIds={people} size="sm"
            onSelect={onPeople} triggerLabel={`Assign people to ${title}`} />
        )}
      </span>
    )
  }
  const toolsOf = (t: Task) => t.completed ? null : tools(t.title, t.context ?? null, assigneesOf(t),
    writers.setTaskContext && ((c) => writers.setTaskContext!(t, c)),
    writers.assignTask && ((ids) => writers.assignTask!(t, ids)))
  const eventTools = (ev: CanvasDayItem) => tools(ev.title, ev.context ?? null, ev.people ?? [],
    writers.setEventContext && ((c) => writers.setEventContext!(ev, c)),
    writers.assignEvent && ((ids) => writers.assignEvent!(ev, ids)))
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
      <LiftableRow key={key} liftId={key} lift={lift} row={row} className={`wc-dayrow${it.kind === 'routine' ? ' is-routine' : ''}${pointedTask(it.task?.id) ? ' is-pointed' : ''}${dayFresh.has(key) ? ' is-new' : ''}${gapCls}`}
        liProps={{ 'data-order-id': order && it.task ? it.task.id : undefined }}
        onComplete={(x) => (x.task ? writers.toggleTask(x.task) : writers.toggleRoutine(x, day.date))}
        onOpen={(x) => writers.open(x.id)}
        onDragStart={phone || coarse ? undefined : (x, ev) => x.task
          ? startDrag(ev, { kind: 'task', id: x.task.id, date: day.key, title: x.title }, { kind: 'task', id: x.task.id, fromKey: day.key })
          : x.routineId ? startDrag(ev, { kind: 'routine', id: x.routineId, date: day.key, title: x.title }, { kind: 'occ', id: x.routineId, fromKey: day.key }) : undefined}
        onDragEnd={endDrag}
        under={<>{peopleOf(it)}{it.task && toolsOf(it.task)}</>} />
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
                <li key={ev.id} className="wc-eventrow">
                  <EventButton liftId={`${day.key}:${ev.id}`} lift={lift} className={`wc-event${movable ? ' is-movable' : ''}`} onClick={() => writers.open(ev.id)}
                    draggable={movable && !coarse} onDragStart={movable && !coarse ? (e) => startEventDrag(e, ev, day.key) : undefined}
                    onDragEnd={movable && !coarse ? endDrag : undefined}>
                    {ev.time && <span className="wc-event-time">{formatTimeCompact(ev.time)}</span>}
                    <span className="wc-event-title">{ev.title}{ev.subtitle && <span className="wc-event-sub">{ev.subtitle}</span>}</span>
                  </EventButton>
                  {eventTools(ev)}
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
        {phone && (day.dinners ?? []).length > 0 && (
          <p className="wc-dinner" data-guide-anchor="dinner"><span className="wc-dinner-label">Dinner</span>{' '}
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
        {!phone && writers.addTyped && (
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
  const shelfMeta = new Map(shelf.flatMap((g) => g.rows.map((r) => [r.task.id, r.meta] as const)))
  const flow = shelf[0]?.flow
  // Dragging a day's task: the column says so (even empty), so it can be dropped back.
  const draggingPlaced = drag?.kind === 'task' && !!drag.fromKey
  // ── Sometime this week ────────────────────────────────────────────────
  // The week's first column (Scott, 2026-11-04: "why the duplicate
  // ribbons?"): what the strip's Week tab held — the tasks chosen for this
  // week with no day, each with When ▾, dragged onto a day — and the weekly
  // routines that still need a day. Rows read as a day's rows do. On the
  // phone, touch can't drag: a + beside each gives it a day.
  const weekKey = localYmd(weekStart)
  const { fresh } = useNewcomers(weekKey, [...unplaced.map((t) => t.id), ...routinesToPlace.map((r) => r.id)])
  const everyDay = rhythm.flatMap((r) => r.items.map((it) => it.title))
  const weekTaskRow = (t: Task) => {
    const key = `noday:task:${t.id}`
    const payload: PlanDragPayload = { kind: 'task', id: t.id, date: weekKey, title: t.title }
    const lift: Lift | null = coarse && !phone ? { payload, drag: { kind: 'task', id: t.id }, title: t.title } : null
    const triage = writers.triageTask && (
      <TriageWhenMenu contained season={false} months={false}
        onPick={(when) => { setWhenOpen(null); writers.triageTask!(t, when) }}
        onPickDate={writers.scheduleTask ? (at, allDay) => writers.scheduleTask!(t, at, allDay) : undefined}
        onDelete={writers.deleteTask ? () => { setWhenOpen(null); writers.deleteTask!(t) } : undefined}
      />
    )
    return (
      <LiftableRow key={key} liftId={key} lift={lift} row={{ key, id: t.id, title: t.title, item: t, completed: t.completed, meta: shelfMeta.get(t.id) ?? undefined }}
        className={`wc-dayrow wc-weekrow${pointedTask(t.id) ? ' is-pointed' : ''}${whenOpen === key ? ' is-when-open' : ''}${fresh.has(t.id) ? ' is-new' : ''}`}
        onComplete={() => writers.toggleTask(t)}
        onOpen={() => writers.open(`task-${t.id}`)}
        under={toolsOf(t)}
        onDragStart={phone || coarse ? undefined : (_, ev) => startDrag(ev, payload, { kind: 'task', id: t.id })}
        onDragEnd={endDrag}
        extra={triage && (
          <button type="button" className="wc-when" aria-expanded={whenOpen === key} aria-label={`When for ${t.title}`}
            onClick={() => setWhenOpen(whenOpen === key ? null : key)}>When ▾</button>
        )}
        trailing={phone ? (
          <button type="button" className="wc-noday-add" aria-label={`Give ${t.title} a day`} aria-expanded={picker?.key === key}
            onClick={() => setPicker(picker?.key === key ? null : { key })}>+</button>
        ) : undefined}>
        {/* The Inbox's when-chips and a date (Scott, 2026-10-14: no Triage
            mode), under the row on asking: on the phone too, where the
            section sits above the days and must stay short. */}
        {triage && whenOpen === key && <div className="wc-noday-actions" role="group" aria-label={`When for ${t.title}`}>{triage}</div>}
        {pick(key, t.title, (d) => writers.placeTask(t, d))}
      </LiftableRow>
    )
  }
  // A weekly routine with no day yet needs one before it can be done: its
  // square is a mark, not a check.
  const weekRoutineRow = (r: ShelfRoutine) => {
    const key = `noday:routine:${r.id}`
    const payload: PlanDragPayload = { kind: 'routine', id: r.id, date: weekKey, title: r.title }
    const lift: Lift | null = coarse && !phone ? { payload, drag: { kind: 'routine', id: r.id }, title: r.title } : null
    return (
      <LiftableRow key={key} liftId={key} lift={lift} row={{ key, id: r.id, title: r.title, item: r }}
        className={`wc-dayrow wc-weekrow is-routine${fresh.has(r.id) ? ' is-new' : ''}`}
        onOpen={() => writers.open(`routine-${r.id}`)}
        onDragStart={phone || coarse ? undefined : (_, ev) => startDrag(ev, payload, { kind: 'routine', id: r.id })}
        onDragEnd={endDrag}
        trailing={phone ? (
          <button type="button" className="wc-noday-add" aria-label={`Give ${r.title} a day`} aria-expanded={picker?.key === key}
            onClick={() => setPicker(picker?.key === key ? null : { key })}>+</button>
        ) : undefined}>
        {pick(key, r.title, (d) => writers.placeRoutine(r, d))}
      </LiftableRow>
    )
  }
  const weekCount = unplaced.length + routinesToPlace.length
  // The phone draws it only when it holds something (or takes a drop), as its
  // No day yet tray did; the desk always, as the week's first column.
  const weekColumn = (!phone || weekCount > 0 || draggingPlaced) && (
    <DropZone as="section" id="noday" className={`wc-day wc-weekcol${overShelf ? ' is-over' : ''}${weekCount === 0 ? ' is-empty' : ''}`}
      aria-label="Sometime this week" data-testid="week-sometime" data-explain="still-to-place" data-explain-label="Sometime this week"
      style={phone ? undefined : { gridColumn: 1 }} {...shelfDrop}>
      <header className="wc-dayhead">
        {/* Headed like a day ("MON 2"), in the same small capitals (Scott,
            2026-11-06); the tray it heads is what sets it apart (2026-11-07). */}
        <span className="wc-dayname">Sometime this week</span>
        {weekCount > 0 && <span className="wc-weekcol-count" aria-label={`${weekCount} without a day`}>{weekCount}</span>}
      </header>
      <div className="wc-daybody">
        {/* The week's line to write on, always open at the top of its list
            (Scott, 2026-11-06: one item after another, without reopening a
            box). Return adds and keeps the cursor here for the next one. The
            Week session's Choose step points at it (data-guide-anchor). */}
        {!phone && writers.addTyped && (
          <WriteLine placeholder="Add to this week" periodWord="this week"
            period={{ start: weekStart, end: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6) }}
            onWrite={writers.addTyped} />
        )}
        {draggingPlaced && <p className="wc-drop-hint" aria-live="polite">Drop here to take its day away</p>}
        {weekCount > 0
          ? <ul className="cw-rows wc-items">{unplaced.map(weekTaskRow)}{routinesToPlace.map(weekRoutineRow)}</ul>
          : !draggingPlaced && <p className="wc-weekcol-note">Everything on this week has a day.</p>}
        {unplaced.length > 0 && onPlaceUnplaced && (
          <button type="button" className="canvas-link wc-quiet-link wc-more" onClick={onPlaceUnplaced}>Place them one at a time</button>
        )}
        {/* The week's tally: everything that came onto it, how much has a
            day, how much is done. Things go in and out of here all week. */}
        {flow && flow.in > 0 && (
          <p className="wc-tray-flow" data-testid="week-flow">
            <span><b>{flow.in}</b> in</span>
            <span><b>{flow.onDays}</b> onto days</span>
            <span><b>{flow.done}</b> done</span>
          </p>
        )}
        {!phone && everyDay.length > 0 && (
          <p className="wc-weekcol-note">Every-day routines are on <Link to="/today">Today</Link>: {everyDay.slice(0, 3).join(', ')}{everyDay.length > 3 ? ` and ${everyDay.length - 3} more` : ''}.</p>
        )}
      </div>
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
  // The first column is Sometime this week; the days follow it.
  const colOf = new Map(stripDays.map((d, i) => [d.key, i + 2]))
  const bars = spans.flatMap((sp) => {
    if (!sp.from || !sp.to) return []
    const cols = stripDays.filter((d) => d.key >= sp.from! && d.key <= sp.to!).map((d) => colOf.get(d.key)!)
    return cols.length ? [{ sp, start: Math.min(...cols), end: Math.max(...cols) }] : []
  })
  // The weekend's days are wider: family and household plans live there. Set
  // from the days themselves, so a Saturday-first week widens its first two.
  // Sometime this week wider than a weekday: the tray's cards carry When ▾.
  const stripCols = ['minmax(0,1.6fr)', ...stripDays.map((d) => (isWeekend(d.date) ? 'minmax(0,1.5fr)' : 'minmax(0,1fr)'))].join(' ')
  const barTail = (sp: CanvasSpan) => sp.tail?.replace(/^,\s*/, '')
  // Last week's progress and "Today: …" are the header's fact line (WeekV2,
  // calm pass 2); the canvas keeps only a past week's note.
  const subtitleNode = slots?.subline && !phone
    ? pastNote && createPortal(pastNote, slots.subline)
    : pastNote && <p className="wc-subtitle is-inline">{pastNote}</p>

  // The month above, folded beside the days for reading (paper-style
  // horizons, 2026-11-04), hinged at their left edge (the top edge on a
  // phone). While a guided session plans the week, its step drives this
  // fold (`session`): Read November opens it, and the look back turns it to
  // last week with its choices.
  const look = session?.look ?? null
  const withMonth = (node: ReactNode) => month ? (
    <PaperFold horizon="week" className="wc-fold" edgeLabel={look ? 'Last week' : month.word} edgeCount={look ? undefined : month.rows.length}
      drive={session?.drive} driveKey={session?.stepId} wide={!!look}
      frontLabel={look ? 'Last week, looking back' : undefined}
      above={look ? <LookSheet>{look}</LookSheet>
        : <AboveSheet kicker={month.kicker} title={month.word} rows={month.rows} doneCount={month.doneCount}
          foot="For reading. Write this week in its own words." empty={`No ${month.word} goals yet.`} />}>
      {node}
    </PaperFold>
  ) : node

  if (phone) {
    const sel = days.find((d) => d.key === selectedKey)
    return withTouch(
      <div className={`wc wc-phone${drag ? ' is-dragging' : ''}`}>
        {subtitleNode}
        {withMonth(<>
          {weekColumn}
          <div className="wc-daychips" role="group" aria-label="Days" data-guide-anchor="day">
            {days.map((d) => (
              <button key={d.key} type="button" className={`wc-daychip${d.key === todayKey ? ' is-today' : ''}${pointedDay(d.key) ? ' is-pointed' : ''}`} aria-pressed={d.key === selectedKey}
                aria-label={longDay(d.date)} onClick={() => setChosenDay(d.key)}>
                <span className="wc-daychip-name">{d.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className="wc-daychip-num">{d.date.getDate()}</span>
              </button>
            ))}
          </div>
          {sel && dayColumn(sel)}
          {rhythmNode}
        </>)}
      </div>,
    )
  }
  // ── the desk and tablet ───────────────────────────────────────────────
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
  const dayShort = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const composerDay = composer?.key ? days.find((d) => d.key === composer.key) : undefined
  const composerNode = composer && writers.addTyped && (
    <div className="wc-composer" data-guide-anchor="write">
      <TypedAdd key={composer.key ?? 'week'} label={composerDay ? `Add to ${dayShort(composerDay.date)}` : 'Add to this week'}
        period={{ start: weekStart, end: weekEnd }} periodWord="this week" fallbackDay={composerDay?.date}
        onSave={async (parse, landing) => { const ok = await writers.addTyped!(parse, landing); if (ok) setComposer(null); return ok }}
        onCancel={() => setComposer(null)} />
    </div>
  )
  // Dinner, one row across the days, so the meal plan reads straight across.
  // It is the Week session's Weekly ops home (planning as tooltips, Task 2):
  // a week with no dinners keeps one faint line.
  const dinnerRow = !stripDays.some((d) => (d.dinners ?? []).length > 0) ? (
    <p className="wc-dinners is-empty" aria-label="Dinners" data-guide-anchor="dinner">
      <span className="wc-dinner-label">Dinner</span> No dinners planned yet
    </p>
  ) : (
    <div className="wc-dinners" style={{ ['--wc-n' as string]: stripDays.length, gridTemplateColumns: stripCols }} aria-label="Dinners" data-guide-anchor="dinner">
      {/* under Sometime this week: no dinner */}
      <p className="wc-dinner" aria-hidden="true" />
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
  return withTouch(
    <div className={`wc wc-sheet${drag ? ' is-dragging' : ''}`}>
      {subtitleNode}
      {composerNode}
      {withMonth(
        <section className="wc-days" aria-label="The days" data-guide-anchor="day">
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
          <div className={`wc-strip${bars.length ? ' has-bars' : ''}`} style={{ ['--wc-days' as string]: stripDays.length + 1, ['--wc-n' as string]: stripDays.length, gridTemplateColumns: stripCols }}>
            {weekColumn}
            {stripDays.map((d, i) => dayColumn(d, i + 2))}
            {bars.length > 0 && (
              <div className="wc-bars" aria-hidden="true" style={{ ['--wc-n' as string]: stripDays.length, gridTemplateColumns: stripCols }}>
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
      )}
    </div>,
  )
}
