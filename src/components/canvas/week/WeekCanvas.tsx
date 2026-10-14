// src/components/canvas/week/WeekCanvas.tsx
//
// The Week, as approved (week composition, 2026-10-10; Scott: the wireframes'
// organisation and consistency are core requirements). Days mode of /week,
// plain and ?view=alongside:
//
//   The days         the page (Scott, 2026-10-12: calendar first; mockup
//                    approved 2026-10-13): equal columns in the household's
//                    week order — events in calendar blue, the kids' specials
//                    as chips, placed work as rows with a ⋯ menu and who
//                    carries it, routines as rounded squares, the hours with
//                    nothing scheduled in green ("Calendar clear …",
//                    ROW-LANGUAGE.md); a stay across days as one bar; past
//                    days stepped back and a weekend that is over folded to a
//                    line; done work hidden until "Show done".
//   No day yet       what is chosen for this week with no day, one quiet line
//                    of draggable chips under the title. Inbox, last week and
//                    the month's goals are the planning session's.
//
// Drag a row onto a day to place it, a day's row onto another day to move
// it, back onto the No day yet line to take its day away. While dragging, the
// target day says where it will land.
// Every write is the caller's (WeekViewV2 routes them through the canvas
// activity strip with Undo); this component draws and asks.
//
// Phone (<768px): a row of day chips, the chosen day, then the No day yet line;
// tap opens a chip's task (no drag on touch).

import { useContext, useState, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import type { Task, TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import type { PlanNode } from '@/components/plan/constellation/model'
import { MoveUnderMenu } from '@/components/canvas/plan/MoveUnderMenu'
import { assigneesOf } from '@/lib/planning/v2/planV2'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { Link } from 'react-router-dom'
import { formatTimeCompact } from '@/lib/dateHelpers'
import { isPlanDrag, readPlanDrag, writePlanDrag, type PlanDragPayload } from '@/lib/planning/planDrag'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { PlanMastheadSlotsContext } from '@/components/plan/v2/planMastheadSlots'
import { CompactWeekRow, type CompactRow } from './CompactWeekList'
import { CanvasMenu, GiveItADay, PeoplePicker } from './GiveItADay'
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
  dinners?: { id: string; label: string }[]
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
  /** Resolves true once stored; the composer keeps its words otherwise. */
  addAction: (title: string, milestoneId?: string, area?: TaskContext) => Promise<boolean>
  milestoneDone: (milestoneId: string) => void
  /** The milestone itself onto this week (it stays on the month's list). */
  putOnWeek: (milestoneId: string) => void
  /** People… — who carries it (assigned_to_all, the first as assigned_to). */
  assign: (task: Task, ids: string[]) => void
  /** Life area… */
  setArea: (task: Task, area: TaskContext | undefined) => void
  /** Move under… — the milestones it may serve, as Plan offers them. Null:
   *  nothing to offer for this row. */
  moveUnderOptions: (task: Task) => { item: PlanNode; parents: PlanNode[] } | null
  moveUnder: (task: Task, parent: PlanNode | null) => void
  /** Opens the details pane for a selectable id. */
  open: (id: string) => void
  /** A plan row from elsewhere (the Today pin) dropped on a day. */
  foreignDrop?: (day: Date, payload: PlanDragPayload) => void
}

export interface WeekCanvasProps {
  weekStart: Date
  days: CanvasDay[]
  shelf: ShelfGroup[]
  routinesToPlace: ShelfRoutine[]
  /** Routines written once above the days ("Every day", "Weekdays"). */
  rhythm?: { label: string; items: { title: string; openId: string }[] }[]
  /** "October" — whose milestones the shelf is grouped under. */
  monthName: string
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
  /** Unused since the tray went (callers still pass it; Task 15 prunes). */
  defaultArea?: TaskContext
  /** Unused since the tray went (callers still pass it; Task 15 prunes). */
  focusAdd?: boolean
}

const AREAS: { value: TaskContext; label: string }[] = [
  { value: 'work', label: 'Work' }, { value: 'family', label: 'Family' }, { value: 'personal', label: 'Personal' },
]

type Drag = { kind: 'task' | 'routine' | 'occ'; id: string; groupKey?: string; fromKey?: string }
type Picker = { key: string; mode: 'place' | 'move' } | null

const longDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

export function WeekCanvas({ weekStart, days, shelf, routinesToPlace, rhythm = [], monthName, isCurrent, writers, spans = [], dayDescriptions, members = [], daily }: WeekCanvasProps) {
  const phone = useMediaQuery('(max-width: 767px)')
  const slots = useContext(PlanMastheadSlotsContext)
  const [showDone, setShowDone] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [overDay, setOverDay] = useState<string | null>(null)
  const [overShelf, setOverShelf] = useState(false)
  const [picker, setPicker] = useState<Picker>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [panel, setPanel] = useState<{ key: string; kind: 'people' | 'area' | 'move' } | null>(null)
  const [weekendOpen, setWeekendOpen] = useState(false)
  const todayKey = localYmd(new Date())
  const [chosenDay, setChosenDay] = useState<string | null>(null)
  const selectedKey = chosenDay && days.some((d) => d.key === chosenDay) ? chosenDay : (days.find((d) => d.key === todayKey) ?? days[0])?.key

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
    setDrag(d); setPicker(null); setMenu(null)
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
    <GiveItADay title={title} days={dates} inline={phone} current={current} describe={dayDescriptions} label={picker.mode === 'move' ? 'Move to' : 'Give it a day'}
      onPick={(d) => { setPicker(null); onPick(d) }} onClose={() => setPicker(null)} />
  ))
  // People…, Life area…, Move under… — the row's secondary actions, in its ⋯.
  const taskMenuItems = (t: Task, key: string) => [
    { label: 'People…', onSelect: () => setPanel({ key, kind: 'people' as const }) },
    { label: 'Life area…', onSelect: () => setPanel({ key, kind: 'area' as const }) },
    ...(writers.moveUnderOptions(t) ? [{ label: 'Move under…', onSelect: () => setPanel({ key, kind: 'move' as const }) }] : []),
  ]
  const taskPanel = (t: Task, key: string): ReactNode => {
    if (panel?.key !== key) return null
    const close = () => setPanel(null)
    if (panel.kind === 'people') return <PeoplePicker title={t.title} members={members} selected={assigneesOf(t)} onChange={(ids) => writers.assign(t, ids)} onClose={close} />
    if (panel.kind === 'area') {
      return <CanvasMenu label={`Life area for ${t.title}`} onClose={close} items={[
        ...AREAS.map((a) => ({ label: a.label, checked: t.context === a.value, onSelect: () => writers.setArea(t, a.value) })),
        { label: 'No life area', checked: !t.context, onSelect: () => writers.setArea(t, undefined) },
      ]} />
    }
    const o = writers.moveUnderOptions(t)
    return o && <MoveUnderMenu item={o.item} parents={o.parents} parentTerm={`${monthName} goal`} open
      onOpenChange={(v) => { if (!v) close() }} onPick={(p) => { close(); writers.moveUnder(t, p) }} />
  }
  const moreButton = (title: string, key: string, items: { label: string; onSelect: () => void }[], size = 16) => (
    <span className="wc-more-wrap">
      <button type="button" className="canvas-icon wc-more" aria-label={`More for ${title}`} aria-haspopup="menu" aria-expanded={menu === key}
        onClick={() => { setPicker(null); setPanel(null); setMenu(menu === key ? null : key) }}>
        <MoreHorizontal size={size} aria-hidden="true" />
      </button>
      {menu === key && <CanvasMenu label={title} items={items} onClose={() => setMenu(null)} />}
    </span>
  )
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
        <li key={`${day.key}:${it.id}`} className="cw-row wc-dayrow is-proposed" data-testid="proposed-row">
          <span className="canvas-item-title">
            <span className="cw-title">{it.title}</span>
            {it.time && <span className="cw-sub"><span className="cw-meta">{formatTimeCompact(it.time)}</span></span>}
          </span>
          <span className="sr-only"> (proposed, not saved yet)</span>
        </li>
      )
    }
    const key = `${day.key}:${it.id}`
    const entityId = it.task?.id ?? it.routineId ?? it.id
    const row: CompactRow<CanvasDayItem> = { key, id: entityId, title: it.title, item: it, completed: it.completed, meta: it.time ? formatTimeCompact(it.time) : null }
    const isTask = it.kind === 'task' && !!it.task
    const items = [
      { label: 'Move to another day', onSelect: () => setPicker({ key, mode: 'move' }) },
      ...(isTask ? [{ label: 'Back to still to place', onSelect: () => writers.unplaceTask(it.task!) }] : []),
      { label: 'Open', onSelect: () => writers.open(it.id) },
      { label: it.completed ? 'Mark not done' : 'Complete', onSelect: () => (isTask ? writers.toggleTask(it.task!) : writers.toggleRoutine(it, day.date)) },
      ...(isTask && !it.completed ? taskMenuItems(it.task!, key) : []),
    ]
    return (
      <CompactWeekRow key={key} row={row} className={`wc-dayrow${it.kind === 'routine' ? ' is-routine' : ''}${panel?.key === key || picker?.key === key ? ' has-picker' : ''}`}
        onComplete={(x) => (x.task ? writers.toggleTask(x.task) : writers.toggleRoutine(x, day.date))}
        onOpen={(x) => writers.open(x.id)}
        onDragStart={phone ? undefined : (x, ev) => x.task
          ? startDrag(ev, { kind: 'task', id: x.task.id, date: day.key, title: x.title }, { kind: 'task', id: x.task.id, fromKey: day.key })
          : x.routineId ? startDrag(ev, { kind: 'routine', id: x.routineId, date: day.key, title: x.title }, { kind: 'occ', id: x.routineId, fromKey: day.key }) : undefined}
        onDragEnd={endDrag}
        under={peopleOf(it)}
        trailing={moreButton(it.title, key, items, 15)}>
        {pick(key, it.title, (d) => (isTask ? writers.moveTask(it.task!, d) : writers.moveRoutine(it, day.key, d)), day.key)}
        {isTask && taskPanel(it.task!, key)}
      </CompactWeekRow>
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
      <section key={day.key} className={`wc-day${day.key === todayKey ? ' is-today' : ''}${gone ? ' is-past' : ''}${over ? ' is-over' : ''}${empty ? ' is-empty' : ''}`}
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
            {day.dinners!.map((d, i) => <span key={d.id}>{i > 0 && ' · '}<button type="button" className="wc-rhythm-item" onClick={() => writers.open(d.id)}>{d.label}</button></span>)}
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
  // current week only.
  const sentence = isCurrent ? weekSentence(days, todayKey) : null
  const unplaced = shelf.flatMap((g) => g.rows.map((r) => r.task))
  // Dragging a day's task: the line shows (even empty) so it can be dropped back.
  const draggingPlaced = drag?.kind === 'task' && !!drag.fromKey
  const shelfLine = (
    <span className="wc-tray">
      {(unplaced.length > 0 || draggingPlaced) && (
        <span className={`wc-noday${overShelf ? ' is-over' : ''}`} data-explain="still-to-place" data-explain-label="No day yet" {...shelfDrop}>
          <span className="wc-noday-label">No day yet</span>
          <ul className="wc-noday-chips" aria-label="No day yet">
            {unplaced.map((t) => (
              <li key={t.id} draggable={!phone} className="wc-noday-chip"
                onDragStart={(ev) => startDrag(ev, { kind: 'task', id: t.id, date: localYmd(weekStart), title: t.title }, { kind: 'task', id: t.id })}
                onDragEnd={endDrag}>
                <button type="button" className="wc-noday-open" onClick={() => writers.open(`task-${t.id}`)}>{t.title}</button>
              </li>
            ))}
          </ul>
        </span>
      )}
      {sentence && <span className="wc-tray-aside wc-week-sentence">{sentence}</span>}
    </span>
  )
  // This week's weekend, once over, folds to one line: when it was, what
  // happened, what was left (2026-10-05, #137) — room for the days ahead. One
  // still ahead stays open in full: family and household plans live there. A
  // week gone by has no days ahead to make room for, so nothing folds.
  const isWeekend = (d: CanvasDay) => d.date.getDay() === 0 || d.date.getDay() === 6
  const goneWeekend = phone || !isCurrent ? [] : days.filter((d) => isWeekend(d) && d.key < todayKey)
  const stripDays = weekendOpen ? days : days.filter((d) => !goneWeekend.includes(d))
  const shortDay = (d: CanvasDay) => `${d.date.toLocaleDateString('en-US', { weekday: 'short' })} ${d.date.getDate()}`
  const leftOpen = goneWeekend.flatMap((d) => [...d.items, ...(d.sometime ?? [])].filter((it) => !it.completed && it.kind !== 'event'))
  const weekendFold = goneWeekend.length > 0 && (
    <button type="button" className="wc-weekend-fold" aria-expanded={weekendOpen} onClick={() => setWeekendOpen((o) => !o)}>
      <span className="wc-weekend-fold-title">Weekend</span>
      <span>{goneWeekend.map(shortDay).join(' – ')}</span>
      {!weekendOpen && <span className="wc-weekend-fold-events">{goneWeekend.flatMap((d) => d.events).map((ev) => <span key={ev.id}>{ev.title}</span>)}</span>}
      {!weekendOpen && leftOpen.length > 0 && (
        <span className="wc-weekend-fold-left">Not done: {leftOpen.slice(0, 2).map((it) => it.title).join(', ')}{leftOpen.length > 2 ? `, and ${leftOpen.length - 2} more` : ''}</span>
      )}
      <span className="wc-weekend-fold-open">{weekendOpen ? 'Fold' : 'Open'}</span>
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
    ? createPortal(<>{pastNote}<span className="wc-subtitle">{shelfLine}</span></>, slots.subline)
    : <>{pastNote && <p className="wc-subtitle is-inline">{pastNote}</p>}<p className="wc-subtitle is-inline">{shelfLine}</p></>

  if (phone) {
    const sel = days.find((d) => d.key === selectedKey)
    return (
      <div className="wc wc-phone">
        {subtitleNode}
        <div className="wc-daychips" role="group" aria-label="Days">
          {days.map((d) => (
            <button key={d.key} type="button" className={`wc-daychip${d.key === todayKey ? ' is-today' : ''}`} aria-pressed={d.key === selectedKey}
              aria-label={longDay(d.date)} onClick={() => setChosenDay(d.key)}>
              <span className="wc-daychip-name">{d.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className="wc-daychip-num">{d.date.getDate()}</span>
            </button>
          ))}
        </div>
        {sel && dayColumn(sel)}
        {rhythmNode}
        <div className="wc-done-row">{doneToggle}</div>
      </div>
    )
  }
  return (
    <div className={`wc${drag ? ' is-dragging' : ''}`}>
      {subtitleNode}
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
      </section>
    </div>
  )
}
