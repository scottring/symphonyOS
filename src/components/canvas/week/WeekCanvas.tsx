// src/components/canvas/week/WeekCanvas.tsx
//
// The Week, as approved (week composition, 2026-10-10; Scott: the wireframes'
// organisation and consistency are core requirements). Days mode of /week,
// plain and ?view=alongside:
//
//   Still to place   the week's work with no day yet, ABOVE the days: a
//                    masonry of cards, each headed once by the month milestone
//                    its actions serve; Unlinked last, dashed; weekly routines
//                    that still need a day in their own card. Rows are the
//                    compact week row (CompactWeekRow); + gives it a day.
//   The days         seven equal columns in the household's week order:
//                    events as filled chips, placed work as outlined rows
//                    with a ⋯ menu; done work hidden until "Show done".
//
// Drag a row onto a day to place it, a day's row onto another day to move
// it, back onto the shelf to take its day away. While dragging, the target
// day says where it will land and the row's card lights — the only "tie".
// Every write is the caller's (WeekViewV2 routes them through the canvas
// activity strip with Undo); this component draws and asks.
//
// Phone (<768px): a row of day chips, the chosen day, then the shelf in one
// column; + opens the day chips inline (no drag on touch).

import { useContext, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import type { Task } from '@/types/task'
import { localYmd } from '@/lib/cadence/config'
import { formatTimeCompact } from '@/lib/dateHelpers'
import { isPlanDrag, readPlanDrag, writePlanDrag, type PlanDragPayload } from '@/lib/planning/planDrag'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { PlanMastheadSlotsContext } from '@/components/plan/v2/planMastheadSlots'
import { CompactWeekRow, type CompactRow } from './CompactWeekList'
import { CanvasMenu, GiveItADay } from './GiveItADay'
import { dayChipLabel } from './compactWeek'
import type { ShelfGroup } from './weekShelf'

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
}

/** A calendar event across several days, written once above them. */
export interface CanvasSpan { id: string; when: string; title: string; tail?: string }

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
  addAction: (title: string, milestoneId?: string) => Promise<boolean>
  milestoneDone: (milestoneId: string) => void
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
}

type Drag = { kind: 'task' | 'routine' | 'occ'; id: string; groupKey?: string; fromKey?: string }
type Picker = { key: string; mode: 'place' | 'move' } | null

const longDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

export function WeekCanvas({ weekStart, days, shelf, routinesToPlace, rhythm = [], monthName, isCurrent, writers, spans = [], dayDescriptions }: WeekCanvasProps) {
  const phone = useMediaQuery('(max-width: 767px)')
  const slots = useContext(PlanMastheadSlotsContext)
  const [showDone, setShowDone] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [overDay, setOverDay] = useState<string | null>(null)
  const [overShelf, setOverShelf] = useState(false)
  const [picker, setPicker] = useState<Picker>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [composer, setComposer] = useState<string | null>(null)
  const todayKey = localYmd(new Date())
  const [chosenDay, setChosenDay] = useState<string | null>(null)
  const selectedKey = chosenDay && days.some((d) => d.key === chosenDay) ? chosenDay : (days.find((d) => d.key === todayKey) ?? days[0])?.key

  const dates = days.map((d) => d.date)
  const subtitle = `${isCurrent ? 'This week' : `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`} · actions grouped under ${monthName}’s milestones`

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
  const shelfRow = (t: Task, meta: string | null, groupKey: string) => {
    const key = `task:${t.id}`
    const row: CompactRow<Task> = { key, id: t.id, title: t.title, item: t, completed: t.completed, meta }
    return (
      <CompactWeekRow key={key} row={row} className={picker?.key === key ? 'has-picker' : undefined}
        addLabel={(title) => `Give ${title} a day`} addExpanded={picker?.key === key}
        onAdd={() => { setMenu(null); setPicker(picker?.key === key ? null : { key, mode: 'place' }) }}
        onComplete={writers.toggleTask} onOpen={(x) => writers.open(`task-${x.id}`)}
        onDragStart={phone ? undefined : (x, ev) => startDrag(ev, { kind: 'task', id: x.id, date: localYmd(weekStart), title: x.title }, { kind: 'task', id: x.id, groupKey })}
        onDragEnd={endDrag}>
        {pick(key, t.title, (d) => writers.placeTask(t, d))}
      </CompactWeekRow>
    )
  }
  const groupCard = (g: ShelfGroup) => {
    const title = g.milestone ? g.milestone.title : 'Unlinked'
    const source = drag?.groupKey === g.key
    const menuKey = `group:${g.key}`
    const rows = [...g.rows, ...(showDone ? g.done : [])]
    return (
      <section key={g.key} className={`canvas-group wc-group${g.milestone ? '' : ' is-unlinked'}${source ? ' is-source' : ''}`} aria-label={title}>
        <div className="canvas-group-head wc-group-head">
          <span className="canvas-group-title">{title}</span>
          {g.milestone && (
            <span className="wc-more-wrap">
              <button type="button" className="canvas-icon wc-more" aria-label={`More for ${title}`} aria-haspopup="menu" aria-expanded={menu === menuKey}
                onClick={() => { setPicker(null); setMenu(menu === menuKey ? null : menuKey) }}>
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
              {menu === menuKey && (
                <CanvasMenu label={`${title}`} onClose={() => setMenu(null)} items={[
                  { label: 'Mark done', onSelect: () => writers.milestoneDone(g.milestone!.id) },
                  { label: 'Open details', onSelect: () => writers.open(`task-${g.milestone!.id}`) },
                  { label: 'Add an action', onSelect: () => setComposer(g.key) },
                ]} />
              )}
            </span>
          )}
        </div>
        {rows.length > 0 && <ul className="cw-rows">{rows.map((r) => shelfRow(r.task, r.meta, g.key))}</ul>}
        <Composer open={composer === g.key} label={g.milestone ? `Add an action for ${title}` : 'Add something for this week'}
          onOpen={() => setComposer(g.key)} onClose={() => setComposer(null)}
          onAdd={(text) => writers.addAction(text, g.milestone?.id)} />
      </section>
    )
  }
  const unlinked = shelf.filter((g) => !g.milestone)
  const linked = shelf.filter((g) => g.milestone)
  const routinesCard = routinesToPlace.length > 0 && (
    <section key="routines" className={`canvas-group wc-group wc-routines${drag?.groupKey === 'routines' ? ' is-source' : ''}`} aria-label="Routines to place">
      <div className="canvas-group-head wc-group-head"><span className="canvas-group-title">Routines to place</span></div>
      <ul className="cw-rows">
        {routinesToPlace.map((r) => {
          const key = `routine:${r.id}`
          return (
            <CompactWeekRow key={key} row={{ key, id: r.id, title: r.title, item: r }} className={`is-routine${picker?.key === key ? ' has-picker' : ''}`}
              addLabel={(title) => `Give ${title} a day`} addExpanded={picker?.key === key}
              onAdd={() => { setMenu(null); setPicker(picker?.key === key ? null : { key, mode: 'place' }) }}
              onOpen={(x) => writers.open(`routine-${x.id}`)}
              onDragStart={phone ? undefined : (x, ev) => startDrag(ev, { kind: 'routine', id: x.id, date: localYmd(weekStart), title: x.title }, { kind: 'routine', id: x.id, groupKey: 'routines' })}
              onDragEnd={endDrag}>
              {pick(key, r.title, (d) => writers.placeRoutine(r, d))}
            </CompactWeekRow>
          )
        })}
      </ul>
    </section>
  )
  const shelfNode = (
    <section className={`wc-shelf${overShelf ? ' is-over' : ''}`} aria-label="Still to place" {...shelfDrop}>
      <div className="wc-shelf-head">
        <h2 className="wc-label">Still to place</h2>
        <p className="wc-hint">{phone ? 'Press + to give it a day' : 'Drag onto a day, or press + to give it a day'}</p>
      </div>
      <div className="wc-masonry">
        {linked.map(groupCard)}
        {routinesCard}
        {unlinked.map(groupCard)}
      </div>
    </section>
  )

  // ── the days ───────────────────────────────────────────────────────────
  const dayRow = (it: CanvasDayItem, day: CanvasDay) => {
    const key = `${day.key}:${it.id}`
    const entityId = it.task?.id ?? it.routineId ?? it.id
    const row: CompactRow<CanvasDayItem> = { key, id: entityId, title: it.title, item: it, completed: it.completed, meta: it.time ? formatTimeCompact(it.time) : null }
    const isTask = it.kind === 'task' && !!it.task
    const items = [
      { label: 'Move to another day', onSelect: () => setPicker({ key, mode: 'move' }) },
      ...(isTask ? [{ label: 'Back to still to place', onSelect: () => writers.unplaceTask(it.task!) }] : []),
      { label: 'Open', onSelect: () => writers.open(it.id) },
      { label: it.completed ? 'Mark not done' : 'Complete', onSelect: () => (isTask ? writers.toggleTask(it.task!) : writers.toggleRoutine(it, day.date)) },
    ]
    return (
      <CompactWeekRow key={key} row={row} className={`wc-dayrow${it.kind === 'routine' ? ' is-routine' : ''}`}
        onComplete={(x) => (x.task ? writers.toggleTask(x.task) : writers.toggleRoutine(x, day.date))}
        onOpen={(x) => writers.open(x.id)}
        onDragStart={phone ? undefined : (x, ev) => x.task
          ? startDrag(ev, { kind: 'task', id: x.task.id, date: day.key, title: x.title }, { kind: 'task', id: x.task.id, fromKey: day.key })
          : x.routineId ? startDrag(ev, { kind: 'routine', id: x.routineId, date: day.key, title: x.title }, { kind: 'occ', id: x.routineId, fromKey: day.key }) : undefined}
        onDragEnd={endDrag}
        trailing={<span className="wc-more-wrap">
          <button type="button" className="canvas-icon wc-more" aria-label={`More for ${it.title}`} aria-haspopup="menu" aria-expanded={menu === key}
            onClick={() => { setPicker(null); setMenu(menu === key ? null : key) }}>
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>
          {menu === key && <CanvasMenu label={it.title} items={items} onClose={() => setMenu(null)} />}
        </span>}>
        {pick(key, it.title, (d) => (isTask ? writers.moveTask(it.task!, d) : writers.moveRoutine(it, day.key, d)), day.key)}
      </CompactWeekRow>
    )
  }
  const dayColumn = (day: CanvasDay) => {
    const items = day.items.filter((it) => showDone || !it.completed)
    const sometime = (day.sometime ?? []).filter((it) => showDone || !it.completed)
    const empty = !day.events.length && !items.length && !sometime.length
    const over = overDay === day.key
    return (
      <section key={day.key} className={`wc-day${day.key === todayKey ? ' is-today' : ''}${over ? ' is-over' : ''}${empty ? ' is-empty' : ''}`}
        aria-label={longDay(day.date)} data-testid={`journal-day-${day.key}`} {...dayDrop(day)}>
        <header className="wc-dayhead">
          <span className="wc-dayname">{day.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
          <span className="wc-daynum">{day.date.getDate()}</span>
          {day.key === todayKey && <span className="sr-only">(today)</span>}
        </header>
        {over && <p className="wc-drop-hint" aria-live="polite">Drop on {dayChipLabel(day.date)}</p>}
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
      </section>
    )
  }
  const doneToggle = (
    <button type="button" className="canvas-link cw-done-toggle wc-done" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
      {showDone ? 'Hide done' : 'Show done'}
    </button>
  )
  const rhythmNode = rhythm.filter((r) => r.items.length).length > 0 && (
    <div className="wc-rhythm">
      {rhythm.filter((r) => r.items.length).map((r) => (
        <p key={r.label}><span className="wc-rhythm-label">{r.label}</span>{' '}
          {r.items.map((it, i) => <span key={it.openId}>{i > 0 && ' · '}<button type="button" className="wc-rhythm-item" onClick={() => writers.open(it.openId)}>{it.title}</button></span>)}
        </p>
      ))}
    </div>
  )

  const subtitleNode = slots?.subline && !phone
    ? createPortal(<span className="wc-subtitle">{subtitle}</span>, slots.subline)
    : <p className="wc-subtitle is-inline">{subtitle}</p>

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
        {shelfNode}
      </div>
    )
  }
  return (
    <div className={`wc${drag ? ' is-dragging' : ''}`}>
      {subtitleNode}
      {shelfNode}
      <section className="wc-days" aria-label="The days">
        <div className="wc-days-head"><h2 className="wc-label">The days</h2>{doneToggle}</div>
        {spans.length > 0 && (
          <ul className="wc-spans" aria-label="Across these days">
            {spans.map((sp) => (
              <li key={sp.id}><button type="button" className="wc-span" onClick={() => writers.open(sp.id)}>
                <span className="wc-span-when">{sp.when}</span> {sp.title}{sp.tail && <span className="wc-span-when">{sp.tail}</span>}
              </button></li>
            ))}
          </ul>
        )}
        {rhythmNode}
        <div className="wc-strip" style={{ ['--wc-days' as string]: days.length }}>
          {days.map(dayColumn)}
        </div>
      </section>
    </div>
  )
}

function Composer({ open, label, onOpen, onClose, onAdd }: {
  open: boolean
  label: string
  onOpen: () => void
  onClose: () => void
  onAdd: (title: string) => Promise<boolean>
}): ReactNode {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  if (!open) return <div className="wc-group-foot"><button type="button" className="canvas-link wc-add" onClick={onOpen}>+ Add</button></div>
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = text.trim()
    if (!v || saving) return
    setSaving(true)
    const ok = await onAdd(v).catch(() => false)
    setSaving(false)
    // Kept open for the next one; the words stay when the save failed.
    if (ok) setText('')
  }
  return (
    <form className="wc-group-foot wc-composer" onSubmit={(e) => void submit(e)}>
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label={label} placeholder={label} aria-busy={saving || undefined}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }} />
    </form>
  )
}
