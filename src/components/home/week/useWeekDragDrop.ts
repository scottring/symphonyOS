import { useCallback, useState } from 'react'
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
      const task = tasks.find((t) => t.id === activeData.itemId)
      if (!task?.scheduledFor) return
      const oldStart = task.scheduledFor
      const oldEnd = task.endTime ?? new Date(oldStart.getTime() + DEFAULT_DURATION_MS)
      const duration = oldEnd.getTime() - oldStart.getTime()
      void onUpdateTask(activeData.itemId, {
        scheduledFor: newStart,
        endTime: new Date(newStart.getTime() + duration),
      })
      return
    }
  }, [tasks, onUpdateTask])

  return {
    dndHandlers: { onDragStart, onDragEnd, onDragCancel },
    activeDragId,
  }
}

function parseSlotTime(dayIso: string, hour: number, minute: number): Date {
  const [y, m, d] = dayIso.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute, 0, 0)
}
