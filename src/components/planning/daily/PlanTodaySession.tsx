// src/components/planning/daily/PlanTodaySession.tsx
//
// The daily planning ritual. A calm morning triage where the HUMAN decides what
// happens when, and Symphony does the grunt prep: each item already shows its
// staged materials ("Bring"), and the AI only *suggests* a slot. Never a gate —
// Today works fully whether or not you run this.
//
// The pile holds what's NOT yet placed for the day: carried-over tasks, this
// week's task pool, AND non-daily routines due today (weekend routines, weekly
// chores — the ones that otherwise never surface to plan around). Daily routines
// are the day's standing rhythm, so they aren't in the pile.
//
// Two columns: left = the "To place" pile, right = "Your day taking shape"
// (placed items grouped Morning/Afternoon/Evening + fixed calendar anchors).
// Placing a task sets its scheduled time; placing a routine sets its time_of_day.

import { useState, useMemo, useCallback } from 'react'
import { X, CalendarClock, Check, Undo2, GripVertical } from 'lucide-react'
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task, TaskBucket } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Routine } from '@/types/actionable'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { TimeOfDay } from '@/lib/timeUtils'
import type { TimelineItem } from '@/types/timeline'
import { selectOverdue } from '@/lib/today/taskPools'
import { selectHorizonPool } from '@/lib/today/horizons'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { getRoutinesForDatePure } from '@/lib/routineUtils'
import { taskToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import { deriveMaterials } from '@/components/surface/hooks/useStagedMaterials'
import { suggestSlot, timeOfDayToSlot } from '@/lib/planning/suggestSlot'
import { showToast } from '@/hooks/useToast'
import { SLOT_BASE_MINS, minsToSlot, dropMins } from '@/lib/planning/reorder'
import { PlanItemCard, type ItemOrigin } from './PlanItemCard'

/** One thing to place: a task or a non-daily routine, normalized for the pile. */
interface PlanItem {
  kind: 'task' | 'routine'
  id: string
  title: string
  origin: ItemOrigin
  category?: string | null
  timelineItem: TimelineItem
}

/** A placed entry rendered in "taking shape". `mins` = minutes since midnight,
 *  the sort key that drag-reordering manipulates. */
interface PlacedEntry { kind: 'task' | 'routine'; id: string; title: string; slot: TimeOfDay; timeLabel: string; mins: number }

interface Props {
  tasks: Task[]
  events: CalendarEvent[]
  viewedDate: Date
  onClose: () => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  /** Complete a placed task from "taking shape". */
  onCompleteTask: (id: string) => void
  /** Complete a placed routine for the day (optional). */
  onCompleteRoutine?: (id: string) => void
  onSetBucket: (id: string, bucket: TaskBucket) => void
  /** Optional: open the time-block grid (PlanningSession) as a next step. */
  onOpenTimeBlock?: () => void
  /** Contacts for resolving staged phone/person materials. */
  contacts?: Contact[]
  /** Active routines — non-daily ones due today appear in the pile to be placed. */
  routines?: Routine[]
  /** Place a non-daily routine into a slot by setting its time_of_day. */
  onUpdateRoutine?: (id: string, input: { time_of_day?: string | null }) => void | Promise<unknown>
  /** Flag a task "needs a conversation first" (sets needsDiscussion + note). */
  onFlagDiscussion?: (taskId: string, note: string) => void
}

const SECTION_META: { slot: TimeOfDay; label: string; range: string }[] = [
  { slot: 'morning', label: 'Morning', range: '6–12' },
  { slot: 'afternoon', label: 'Afternoon', range: '12–5' },
  { slot: 'evening', label: 'Evening', range: '5+' },
]

function midnight(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function timeToken(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
/** Format a routine "HH:MM[:SS]" time-of-day for display. */
function todLabel(timeOfDay: string): string {
  const [h, m] = timeOfDay.split(':').map(Number)
  const d = new Date(); d.setHours(h, m || 0, 0, 0)
  return timeToken(d)
}

// Minutes-since-midnight display/format helpers (slot math lives in lib/planning/reorder).
function todToMins(timeOfDay: string): number { const [h, m] = timeOfDay.split(':').map(Number); return h * 60 + (m || 0) }
function minsLabel(mins: number): string { const d = new Date(); d.setHours(Math.floor(mins / 60), mins % 60, 0, 0); return timeToken(d) }
function minsToTod(mins: number): string { return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00` }
function minsToDate(date: Date, mins: number): Date { const d = new Date(date); d.setHours(Math.floor(mins / 60), mins % 60, 0, 0); return d }

const evStart = (e: CalendarEvent): string | undefined => e.startTime ?? e.start_time
const evAllDay = (e: CalendarEvent): boolean => Boolean(e.allDay ?? e.all_day)

function eventsOnDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const start = midnight(date)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  return events
    .filter((e) => { const raw = evStart(e); if (!raw) return false; const s = new Date(raw); return s >= start && s < end })
    .sort((a, b) => new Date(evStart(a)!).getTime() - new Date(evStart(b)!).getTime())
}

export function PlanTodaySession({
  tasks, events, viewedDate, onClose, onPushTask, onCompleteTask, onCompleteRoutine,
  onSetBucket, onOpenTimeBlock, contacts = [], routines = [], onUpdateRoutine,
  onFlagDiscussion,
}: Props) {
  const matchAll = useMemo(() => makeAssigneeFilter([]), [])
  const contactsById = useMemo(
    () => Object.fromEntries(contacts.map((c) => [c.id, c])) as Record<string, Contact>,
    [contacts],
  )

  const carriedOver = useMemo(() => selectOverdue(tasks, true, matchAll), [tasks, matchAll])
  const weekPool = useMemo(() => selectHorizonPool(tasks, 'week', matchAll), [tasks, matchAll])

  // Routines due on the viewed day. Non-daily + untimed ones go in the pile to be
  // placed; daily routines are the standing rhythm (not "to place"). Reference
  // (hidden) routines are excluded.
  const dueRoutines = useMemo(() => getRoutinesForDatePure(routines, viewedDate), [routines, viewedDate])
  const pileRoutines = useMemo(
    () => dueRoutines.filter(
      (r) => r.recurrence_pattern?.type !== 'daily' && !r.time_of_day && r.visibility !== 'reference',
    ),
    [dueRoutines],
  )

  // Session placements as minutes-since-midnight (optimistic; enables fine
  // drag-reordering before the async write lands).
  const [chosenMinsById, setChosenMinsById] = useState<Record<string, number>>({})
  const [chosenRoutineMinsById, setChosenRoutineMinsById] = useState<Record<string, number>>({})
  const [notToday, setNotToday] = useState<Set<string>>(() => new Set())
  // Optimistically hide placed entries that were just unplaced or completed,
  // until the underlying tasks/routines props refresh.
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set())

  // The pile: carried-over, then this-week tasks, then non-daily routines.
  const pile = useMemo<PlanItem[]>(() => {
    const seen = new Set<string>()
    const rows: PlanItem[] = []
    const pushTaskRow = (t: Task, origin: ItemOrigin) => {
      if (seen.has(t.id)) return
      seen.add(t.id)
      rows.push({ kind: 'task', id: t.id, title: t.title, origin, category: t.category, timelineItem: taskToTimelineItem(t) })
    }
    for (const t of carriedOver) pushTaskRow(t, 'carried_over')
    for (const t of weekPool) pushTaskRow(t, 'week')
    for (const r of pileRoutines) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      rows.push({ kind: 'routine', id: r.id, title: r.name, origin: 'routine', timelineItem: routineToTimelineItem(r, viewedDate) })
    }
    return rows
  }, [carriedOver, weekPool, pileRoutines, viewedDate])

  // Placed: tasks timed-today + routines timed today, overlaid with this session's
  // choices. Keyed by id → dedup automatic.
  const placedMap = useMemo(() => {
    const map = new Map<string, PlacedEntry>()
    for (const t of tasks) {
      if (t.completed || t.bucket !== 'timed' || t.isAllDay || !t.scheduledFor) continue
      if (!sameDay(new Date(t.scheduledFor), viewedDate)) continue
      const d = new Date(t.scheduledFor)
      const mins = d.getHours() * 60 + d.getMinutes()
      map.set(t.id, { kind: 'task', id: t.id, title: t.title, slot: minsToSlot(mins), timeLabel: timeToken(d), mins })
    }
    for (const r of dueRoutines) {
      if (r.recurrence_pattern?.type === 'daily' || !r.time_of_day || r.visibility === 'reference') continue
      const mins = todToMins(r.time_of_day)
      map.set(r.id, { kind: 'routine', id: r.id, title: r.name, slot: timeOfDayToSlot(r.time_of_day), timeLabel: todLabel(r.time_of_day), mins })
    }
    for (const [id, mins] of Object.entries(chosenMinsById)) {
      const t = tasks.find((x) => x.id === id)
      if (t) map.set(id, { kind: 'task', id, title: t.title, slot: minsToSlot(mins), timeLabel: minsLabel(mins), mins })
    }
    for (const [id, mins] of Object.entries(chosenRoutineMinsById)) {
      const r = routines.find((x) => x.id === id)
      if (r) map.set(id, { kind: 'routine', id, title: r.name, slot: minsToSlot(mins), timeLabel: minsLabel(mins), mins })
    }
    for (const id of removedIds) map.delete(id)
    return map
  }, [tasks, dueRoutines, routines, viewedDate, chosenMinsById, chosenRoutineMinsById, removedIds])

  const visiblePile = useMemo(
    () => pile.filter((it) => !placedMap.has(it.id) && !notToday.has(it.id)),
    [pile, placedMap, notToday],
  )

  const anchors = useMemo(() => eventsOnDate(events, viewedDate), [events, viewedDate])

  const placedCount = placedMap.size
  const toGo = visiblePile.length
  const progressPct = placedCount + toGo === 0 ? 100 : Math.round((placedCount / (placedCount + toGo)) * 100)

  const clearRemoved = useCallback((id: string) => {
    setRemovedIds((prev) => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next })
  }, [])

  // Place/move an item to a specific minute of the day, persisting the time.
  const persistAt = useCallback((kind: 'task' | 'routine', id: string, mins: number) => {
    clearRemoved(id) // re-placing a previously unplaced item
    if (kind === 'task') {
      setChosenMinsById((prev) => ({ ...prev, [id]: mins }))
      onPushTask(id, minsToDate(viewedDate, mins))
    } else {
      setChosenRoutineMinsById((prev) => ({ ...prev, [id]: mins }))
      void onUpdateRoutine?.(id, { time_of_day: minsToTod(mins) })
    }
  }, [onPushTask, onUpdateRoutine, viewedDate, clearRemoved])

  const pickSlot = useCallback((item: PlanItem, slot: TimeOfDay) => {
    persistAt(item.kind, item.id, SLOT_BASE_MINS[slot])
  }, [persistAt])

  const markNotToday = useCallback((item: PlanItem) => {
    setNotToday((prev) => new Set(prev).add(item.id))
    // Tasks move back to the week pool; routines just drop from the pile this
    // session (we don't retime a recurring routine to dismiss one occurrence).
    // Say where it went — silent dismissal reads as "vanished".
    if (item.kind === 'task') {
      onSetBucket(item.id, 'week')
      showToast('Moved to This Week', 'info', 2000)
    }
  }, [onSetBucket])

  // "Needs a conversation first": flag for the to-discuss ledger AND move the
  // task to the week pool — the conversation is the real next step, not a slot.
  const flagDiscussion = useCallback((item: PlanItem, note: string) => {
    if (item.kind !== 'task' || !onFlagDiscussion) return
    onFlagDiscussion(item.id, note)
    setNotToday((prev) => new Set(prev).add(item.id))
    onSetBucket(item.id, 'week')
    showToast('Flagged to discuss — it\u2019s in your to-discuss list', 'success', 2500)
  }, [onFlagDiscussion, onSetBucket])

  // Put a placed item back into the pile: clear its scheduled time/time_of_day.
  const unplace = useCallback((entry: PlacedEntry) => {
    setRemovedIds((prev) => new Set(prev).add(entry.id))
    setChosenMinsById((prev) => { const { [entry.id]: _omit, ...rest } = prev; return rest })
    setChosenRoutineMinsById((prev) => { const { [entry.id]: _omit, ...rest } = prev; return rest })
    if (entry.kind === 'task') onSetBucket(entry.id, 'week')
    else void onUpdateRoutine?.(entry.id, { time_of_day: null })
  }, [onSetBucket, onUpdateRoutine])

  // Complete a placed item from the day-shaping panel.
  const completeEntry = useCallback((entry: PlacedEntry) => {
    setRemovedIds((prev) => new Set(prev).add(entry.id))
    if (entry.kind === 'task') onCompleteTask(entry.id)
    else onCompleteRoutine?.(entry.id)
  }, [onCompleteTask, onCompleteRoutine])

  // Placed entries grouped by slot, each ordered by time (the drag order).
  const slotItems = useMemo(() => {
    const groups: Record<TimeOfDay, PlacedEntry[]> = { morning: [], afternoon: [], evening: [] }
    for (const p of placedMap.values()) groups[p.slot].push(p)
    for (const slot of Object.keys(groups) as TimeOfDay[]) groups[slot].sort((a, b) => a.mins - b.mins)
    return groups
  }, [placedMap])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Drag to reorder. The dropped item takes a time between its new neighbours
  // (a single write); cross-slot drops adopt the destination slot's band.
  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId || overId === activeId) return
    const entry = placedMap.get(activeId)
    if (!entry) return
    const destSlot: TimeOfDay = overId.startsWith('slot:')
      ? (overId.slice(5) as TimeOfDay)
      : (placedMap.get(overId)?.slot ?? entry.slot)
    const dest = slotItems[destSlot].filter((p) => p.id !== activeId)
    let idx = dest.length
    if (!overId.startsWith('slot:')) {
      const oi = dest.findIndex((p) => p.id === overId)
      if (oi >= 0) idx = oi
    }
    const mins = dropMins(dest[idx - 1]?.mins ?? null, dest[idx]?.mins ?? null, destSlot)
    if (mins === entry.mins && destSlot === entry.slot) return
    persistAt(entry.kind, entry.id, mins)
  }, [placedMap, slotItems, persistAt])

  const dateLabel = viewedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 bg-bg-base flex flex-col" role="dialog" aria-label="Plan your day">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/70 shrink-0">
        <div>
          <h1 className="font-display text-2xl text-neutral-800">Plan your day</h1>
          <p className="text-sm text-neutral-500">{dateLabel}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Triage progress */}
      <div className="px-6 pt-4 shrink-0">
        <div className="max-w-[1100px] mx-auto">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1.5">
            <span>{placedCount} placed · {toGo} to go</span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden">
            <div className="h-full bg-primary-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[1100px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1.28fr_1fr] gap-6 items-start">

          {/* LEFT — the pile */}
          <div className="space-y-3">
            <h2 className="text-[11px] uppercase tracking-wider text-neutral-400">To place ({toGo})</h2>
            {visiblePile.length === 0 ? (
              <p className="text-sm text-neutral-400 py-8 text-center">Nothing left to place. Your day is set.</p>
            ) : (
              visiblePile.map((it) => (
                <PlanItemCard
                  key={`${it.kind}-${it.id}`}
                  title={it.title}
                  origin={it.origin}
                  materials={deriveMaterials(it.timelineItem, { contactsById })}
                  suggestion={suggestSlot({ category: it.category, title: it.title }, new Date())}
                  chosenSlot={(() => {
                    const m = it.kind === 'task' ? chosenMinsById[it.id] : chosenRoutineMinsById[it.id]
                    return m != null ? minsToSlot(m) : undefined
                  })()}
                  onPickSlot={(slot) => pickSlot(it, slot)}
                  onNotToday={() => markNotToday(it)}
                  onDiscuss={it.kind === 'task' && onFlagDiscussion ? (note) => flagDiscussion(it, note) : undefined}
                />
              ))
            )}
          </div>

          {/* RIGHT — taking shape (sticky) */}
          <div className="lg:sticky lg:top-4">
            <div className="rounded-2xl border border-neutral-200/80 bg-white p-4">
              <h2 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-3">Your day taking shape</h2>

              {anchors.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">On your calendar</div>
                  <ul className="space-y-1">
                    {anchors.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-sm text-neutral-600">
                        <span className="w-16 shrink-0 text-neutral-400 tabular-nums text-xs">
                          {evAllDay(e) || !evStart(e) ? 'All day' : timeToken(new Date(evStart(e)!))}
                        </span>
                        <span className="truncate">{e.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
                {SECTION_META.map(({ slot, label, range }) => (
                  <SlotSection
                    key={slot}
                    slot={slot}
                    label={label}
                    range={range}
                    items={slotItems[slot]}
                    showRoutineComplete={!!onCompleteRoutine}
                    onComplete={completeEntry}
                    onUnplace={unplace}
                  />
                ))}
              </DndContext>
            </div>

            <button
              type="button"
              onClick={() => {
                showToast(
                  placedCount > 0 ? `Day planned — ${placedCount} placed` : 'Day planned',
                  'success',
                )
                onClose()
              }}
              className="mt-3 w-full rounded-xl bg-primary-600 text-white text-sm font-medium py-3 hover:bg-primary-700 transition-colors"
            >
              Start my day →
            </button>
            <p className="mt-1.5 text-center text-xs text-neutral-400">Your staged materials will be ready as each item comes up.</p>
          </div>
        </div>
      </div>

      {/* Footer — optional time-block + close */}
      <footer className="flex items-center justify-end gap-2 px-6 py-3 border-t border-neutral-200/70 shrink-0">
        {onOpenTimeBlock && (
          <button type="button" onClick={onOpenTimeBlock}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
            <CalendarClock className="w-4 h-4" /> Time-block the day
          </button>
        )}
        <button type="button" onClick={onClose}
          className="text-sm font-medium px-4 py-2 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors">
          Close
        </button>
      </footer>
    </div>
  )
}

/** One time-of-day section in "taking shape": a droppable, sortable list. */
function SlotSection({ slot, label, range, items, showRoutineComplete, onComplete, onUnplace }: {
  slot: TimeOfDay
  label: string
  range: string
  items: PlacedEntry[]
  showRoutineComplete: boolean
  onComplete: (e: PlacedEntry) => void
  onUnplace: (e: PlacedEntry) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot}` })
  return (
    <div ref={setNodeRef} className={`mb-3 last:mb-0 rounded-lg transition-colors ${isOver ? 'bg-primary-50/50' : ''}`}>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-sm font-medium text-neutral-700">{label}</span>
        <span className="text-[11px] text-neutral-400">{range}</span>
      </div>
      <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-2 text-xs text-neutral-300">
            Open — drop an item here
          </div>
        ) : (
          <ul className="space-y-1">
            {items.map((p) => (
              <SortablePlacedRow key={p.id} entry={p} showRoutineComplete={showRoutineComplete} onComplete={onComplete} onUnplace={onUnplace} />
            ))}
          </ul>
        )}
      </SortableContext>
    </div>
  )
}

/** A draggable placed row — grip to reorder, plus complete / put-back. */
function SortablePlacedRow({ entry, showRoutineComplete, onComplete, onUnplace }: {
  entry: PlacedEntry
  showRoutineComplete: boolean
  onComplete: (e: PlacedEntry) => void
  onUnplace: (e: PlacedEntry) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-1.5 rounded-lg bg-neutral-50 px-2 py-1.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${entry.title}`}
        className="shrink-0 p-0.5 text-neutral-300 hover:text-neutral-500 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="w-12 shrink-0 text-[11px] text-neutral-400 tabular-nums">{entry.timeLabel}</span>
      <span className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
      <span className="flex-1 min-w-0 truncate text-sm text-neutral-700">{entry.title}</span>
      {(entry.kind === 'task' || showRoutineComplete) && (
        <button
          type="button"
          onClick={() => onComplete(entry)}
          aria-label={`Complete ${entry.title}`}
          className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onUnplace(entry)}
        aria-label={`Put ${entry.title} back to place`}
        className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition-colors"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
    </li>
  )
}
