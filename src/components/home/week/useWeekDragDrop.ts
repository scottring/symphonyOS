import { useCallback, useRef, useState } from 'react'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

// Task updates may include endTime (timed duration) even though it's not yet
// on the base Task type — the DB layer accepts it via the update handler.
type TaskUpdates = Partial<Task> & { endTime?: Date }

interface UseWeekDragDropArgs {
  weekStart: Date
  onWeekChange: (newWeekStart: Date) => void
  onUpdateTask: (taskId: string, updates: TaskUpdates) => Promise<void> | void
  onUpdateEvent: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void> | void
  onUpdateRoutine: (routineId: string, updates: Partial<Routine>) => Promise<void> | void
  tasks: (Task & { endTime?: Date })[]
  events: CalendarEvent[]
  routines: Routine[]
}

interface UseWeekDragDropResult {
  dndHandlers: {
    onDragStart: (e: DragStartEvent) => void
    onDragEnd: (e: DragEndEvent) => void
    onDragCancel: () => void
  }
  activeDragId: string | null
  /** Call when the dragged pointer enters/leaves an edge zone. Null clears. */
  notifyEdge: (edge: 'left' | 'right' | null) => void
}

const DEFAULT_DURATION_MS = 30 * 60 * 1000

export function useWeekDragDrop(args: UseWeekDragDropArgs): UseWeekDragDropResult {
  const { tasks, onUpdateTask } = args
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
  }, [])

  const onDragCancel = useCallback(() => {
    setActiveDragId(null)
  }, [])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActiveDragId(null)
    if (!e.over) return

    const activeData = e.active.data.current as
      | { kind?: string; taskId?: string; itemId?: string }
      | undefined
    const overData = e.over.data.current as
      | { kind?: string; dayIso?: string; hour?: number; minute?: number }
      | undefined

    if (!activeData || !overData) return
    if (overData.kind !== 'timed' || !overData.dayIso) return

    const newStart = parseSlotTime(overData.dayIso, overData.hour ?? 0, overData.minute ?? 0)

    if (activeData.kind === 'chip' && activeData.taskId) {
      void onUpdateTask(activeData.taskId, {
        isAllDay: false,
        scheduledFor: newStart,
        endTime: new Date(newStart.getTime() + DEFAULT_DURATION_MS),
      })
      return
    }

    if (activeData.kind === 'block' && activeData.itemId) {
      const itemId = String(activeData.itemId)
      // Strip the type prefix to get the raw DB id, then route to the correct
      // mutator. TimelineItem.id is prefixed ('task-xyz', 'event-xyz', etc.);
      // the DB update functions expect the raw uuid.
      if (itemId.startsWith('task-')) {
        const taskId = itemId.slice('task-'.length)
        const task = tasks.find((t) => t.id === taskId)
        if (!task?.scheduledFor) return
        const oldStart = task.scheduledFor
        const oldEnd = task.endTime ?? new Date(oldStart.getTime() + DEFAULT_DURATION_MS)
        const duration = oldEnd.getTime() - oldStart.getTime()
        void onUpdateTask(taskId, {
          scheduledFor: newStart,
          endTime: new Date(newStart.getTime() + duration),
        })
        return
      }
      if (itemId.startsWith('event-')) {
        // Events drag: not yet wired — no-op. (Spec gap to be addressed later.)
        void itemId
        return
      }
      // 'routine-...' shouldn't reach here (routines are non-draggable per spec).
      return
    }
  }, [tasks, onUpdateTask])

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cooldownRef = useRef<boolean>(false)

  const notifyEdge = useCallback((edge: 'left' | 'right' | null) => {
    if (edge === null) {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current)
        advanceTimerRef.current = null
      }
      return
    }
    if (cooldownRef.current) return
    if (advanceTimerRef.current) return // already armed
    advanceTimerRef.current = setTimeout(() => {
      const direction = edge === 'right' ? 7 : -7
      const newStart = new Date(args.weekStart)
      newStart.setDate(newStart.getDate() + direction)
      args.onWeekChange(newStart)
      advanceTimerRef.current = null
      cooldownRef.current = true
      setTimeout(() => { cooldownRef.current = false }, 300)
    }, 500)
  }, [args])

  return {
    dndHandlers: { onDragStart, onDragEnd, onDragCancel },
    activeDragId,
    notifyEdge,
  }
}

function parseSlotTime(dayIso: string, hour: number, minute: number): Date {
  const [y, m, d] = dayIso.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute, 0, 0)
}
