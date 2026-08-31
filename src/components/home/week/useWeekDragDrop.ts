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
  onUpdateTask: (taskId: string, updates: TaskUpdates) => Promise<void | boolean> | void
  onUpdateEvent: (eventId: string, updates: { startTime: Date; endTime: Date }) => Promise<void> | void
  onUpdateRoutine: (routineId: string, updates: Partial<Routine>) => Promise<void> | void
  tasks: (Task & { endTime?: Date })[]
  events: CalendarEvent[]
  routines: Routine[]
  /** Number of days in the displayed week — controls cross-week auto-advance step. Default 7. */
  dayCount?: number
  /** Optional. Called after a successful drag mutation to surface an undo toast. */
  pushAction?: (message: string, undo: () => void) => void
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

    // Dropped on a day's all-day cell → schedule (or keep) the task as all-day
    // on that day. Without this, an all-day chip could only be dropped on a
    // time slot, so "move this to another day, still all-day" did nothing.
    if (overData.kind === 'allDay' && overData.dayIso) {
      const taskId =
        activeData.kind === 'chip'
          ? activeData.taskId
          : activeData.itemId?.startsWith('task-')
          ? activeData.itemId.slice('task-'.length)
          : undefined
      if (!taskId) return
      const newDay = parseSlotTime(overData.dayIso, 0, 0)
      const task = tasks.find((t) => t.id === taskId)
      const prevScheduledFor = task?.scheduledFor ?? null
      const prevIsAllDay = task?.isAllDay ?? false
      const prevEndTime = task?.endTime
      // bucket:'timed' rides along — a pool pill may start in week/month/inbox,
      // and a scheduled task must never sit in another bucket (timed-bucket
      // invariant). No-op for already-placed chips.
      const prevBucket = task?.bucket
      void onUpdateTask(taskId, { isAllDay: true, scheduledFor: newDay, bucket: 'timed' })
      args.pushAction?.(`Moved "${task?.title ?? 'task'}"`, () => {
        void onUpdateTask(taskId, {
          isAllDay: prevIsAllDay,
          scheduledFor: prevScheduledFor as Date,
          endTime: prevEndTime,
          bucket: prevBucket,
        })
      })
      return
    }

    if (overData.kind !== 'timed' || !overData.dayIso) return

    const newStart = parseSlotTime(overData.dayIso, overData.hour ?? 0, overData.minute ?? 0)

    if (activeData.kind === 'chip' && activeData.taskId) {
      const task = tasks.find((t) => t.id === activeData.taskId)
      const prevScheduledFor = task?.scheduledFor ?? null
      const prevIsAllDay = task?.isAllDay ?? false
      const prevEndTime = task?.endTime
      // bucket:'timed' rides along — a pool pill may start in week/month/inbox,
      // and a scheduled task must never sit in another bucket (timed-bucket
      // invariant). No-op for already-placed chips.
      const prevBucket = task?.bucket
      void onUpdateTask(activeData.taskId, {
        isAllDay: false,
        scheduledFor: newStart,
        endTime: new Date(newStart.getTime() + DEFAULT_DURATION_MS),
        bucket: 'timed',
      })
      args.pushAction?.(`Scheduled "${task?.title ?? 'task'}"`, () => {
        void onUpdateTask(activeData.taskId!, {
          isAllDay: prevIsAllDay,
          scheduledFor: prevScheduledFor as Date,
          endTime: prevEndTime,
          bucket: prevBucket,
        })
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
        args.pushAction?.(`Moved "${task.title}"`, () => {
          void onUpdateTask(taskId, {
            scheduledFor: oldStart,
            endTime: oldEnd,
          })
        })
        return
      }
      if (itemId.startsWith('event-')) {
        const eventId = itemId.slice('event-'.length)
        const event = args.events.find((ev) => ev.id === eventId)
        if (!event) return
        const startStr =
          (event as { start_time?: string }).start_time ??
          (event as { startTime?: string }).startTime
        const endStr =
          (event as { end_time?: string }).end_time ??
          (event as { endTime?: string }).endTime
        if (!startStr || !endStr) return
        const oldStart = new Date(startStr)
        const oldEnd = new Date(endStr)
        const duration = oldEnd.getTime() - oldStart.getTime()
        const newEnd = new Date(newStart.getTime() + duration)
        void args.onUpdateEvent(eventId, { startTime: newStart, endTime: newEnd })
        args.pushAction?.(`Moved "${event.title}"`, () => {
          void args.onUpdateEvent(eventId, { startTime: oldStart, endTime: oldEnd })
        })
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
      const direction = edge === 'right' ? (args.dayCount ?? 7) : -(args.dayCount ?? 7)
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
