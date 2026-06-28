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
import { X, CalendarClock } from 'lucide-react'
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
import { suggestSlot, slotTime, slotTimeOfDay, timeOfDayToSlot } from '@/lib/planning/suggestSlot'
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

/** A placed entry rendered in "taking shape". */
interface PlacedEntry { id: string; title: string; slot: TimeOfDay; timeLabel: string }

interface Props {
  tasks: Task[]
  events: CalendarEvent[]
  viewedDate: Date
  onClose: () => void
  onPushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  /** Retained in the triage contract for inline-complete of carried items. */
  onCompleteTask: (id: string) => void
  onSetBucket: (id: string, bucket: TaskBucket) => void
  /** Optional: open the time-block grid (PlanningSession) as a next step. */
  onOpenTimeBlock?: () => void
  /** Contacts for resolving staged phone/person materials. */
  contacts?: Contact[]
  /** Active routines — non-daily ones due today appear in the pile to be placed. */
  routines?: Routine[]
  /** Place a non-daily routine into a slot by setting its time_of_day. */
  onUpdateRoutine?: (id: string, input: { time_of_day?: string | null }) => void | Promise<unknown>
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
function hourToSlot(hour: number): TimeOfDay {
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
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
  tasks, events, viewedDate, onClose, onPushTask, onSetBucket, onOpenTimeBlock,
  contacts = [], routines = [], onUpdateRoutine,
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

  // Session-local decisions (optimistic — reflected before the async write lands).
  const [chosenSlotById, setChosenSlotById] = useState<Record<string, TimeOfDay>>({})
  const [chosenRoutineSlotById, setChosenRoutineSlotById] = useState<Record<string, TimeOfDay>>({})
  const [notToday, setNotToday] = useState<Set<string>>(() => new Set())

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
      map.set(t.id, { id: t.id, title: t.title, slot: hourToSlot(d.getHours()), timeLabel: timeToken(d) })
    }
    for (const r of dueRoutines) {
      if (r.recurrence_pattern?.type === 'daily' || !r.time_of_day || r.visibility === 'reference') continue
      map.set(r.id, { id: r.id, title: r.name, slot: timeOfDayToSlot(r.time_of_day), timeLabel: todLabel(r.time_of_day) })
    }
    for (const [id, slot] of Object.entries(chosenSlotById)) {
      const t = tasks.find((x) => x.id === id)
      if (t) map.set(id, { id, title: t.title, slot, timeLabel: timeToken(slotTime(viewedDate, slot)) })
    }
    for (const [id, slot] of Object.entries(chosenRoutineSlotById)) {
      const r = routines.find((x) => x.id === id)
      if (r) map.set(id, { id, title: r.name, slot, timeLabel: timeToken(slotTime(viewedDate, slot)) })
    }
    return map
  }, [tasks, dueRoutines, routines, viewedDate, chosenSlotById, chosenRoutineSlotById])

  const visiblePile = useMemo(
    () => pile.filter((it) => !placedMap.has(it.id) && !notToday.has(it.id)),
    [pile, placedMap, notToday],
  )

  const anchors = useMemo(() => eventsOnDate(events, viewedDate), [events, viewedDate])

  const placedCount = placedMap.size
  const toGo = visiblePile.length
  const progressPct = placedCount + toGo === 0 ? 100 : Math.round((placedCount / (placedCount + toGo)) * 100)

  const pickSlot = useCallback((item: PlanItem, slot: TimeOfDay) => {
    if (item.kind === 'task') {
      setChosenSlotById((prev) => ({ ...prev, [item.id]: slot }))
      onPushTask(item.id, slotTime(viewedDate, slot))
    } else {
      setChosenRoutineSlotById((prev) => ({ ...prev, [item.id]: slot }))
      void onUpdateRoutine?.(item.id, { time_of_day: slotTimeOfDay(slot) })
    }
  }, [onPushTask, onUpdateRoutine, viewedDate])

  const markNotToday = useCallback((item: PlanItem) => {
    setNotToday((prev) => new Set(prev).add(item.id))
    // Tasks move back to the week pool; routines just drop from the pile this
    // session (we don't retime a recurring routine to dismiss one occurrence).
    if (item.kind === 'task') onSetBucket(item.id, 'week')
  }, [onSetBucket])

  const placedBySlot = useCallback(
    (slot: TimeOfDay) => Array.from(placedMap.values()).filter((p) => p.slot === slot),
    [placedMap],
  )

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
                  suggestion={suggestSlot({ category: it.category, title: it.title })}
                  chosenSlot={it.kind === 'task' ? chosenSlotById[it.id] : chosenRoutineSlotById[it.id]}
                  onPickSlot={(slot) => pickSlot(it, slot)}
                  onNotToday={() => markNotToday(it)}
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

              {SECTION_META.map(({ slot, label, range }) => {
                const items = placedBySlot(slot)
                return (
                  <div key={slot} className="mb-3 last:mb-0">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-sm font-medium text-neutral-700">{label}</span>
                      <span className="text-[11px] text-neutral-400">{range}</span>
                    </div>
                    {items.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-2 text-xs text-neutral-300">
                        Open — place an item here
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {items.map((p) => (
                          <li key={p.id} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-1.5">
                            <span className="w-12 shrink-0 text-[11px] text-neutral-400 tabular-nums">{p.timeLabel}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-400 shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-sm text-neutral-700">{p.title}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
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
