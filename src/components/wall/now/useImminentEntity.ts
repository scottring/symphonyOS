import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

export type ImminentEntity =
  | { kind: 'event'; entity: CalendarEvent; startTime: Date }
  | { kind: 'task'; entity: Task; startTime: Date }

export interface UseImminentEntityInput {
  events: CalendarEvent[]
  tasks: Task[]
  now: Date
  /** Window in minutes; only entities starting within [now, now+window] are considered. */
  windowMinutes: number
}

function eventStartTime(event: CalendarEvent): Date | null {
  const iso = (event as { start_time?: string; startTime?: string }).start_time
    || (event as { start_time?: string; startTime?: string }).startTime
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export function useImminentEntity(input: UseImminentEntityInput): ImminentEntity | null {
  const { events, tasks, now, windowMinutes } = input
  return useMemo(() => {
    const windowEnd = new Date(now.getTime() + windowMinutes * 60_000)
    const candidates: ImminentEntity[] = []

    for (const event of events) {
      const start = eventStartTime(event)
      if (!start) continue
      if (start <= now) continue
      if (start > windowEnd) continue
      candidates.push({ kind: 'event', entity: event, startTime: start })
    }

    for (const task of tasks) {
      if (!task.scheduledFor) continue
      const start = task.scheduledFor instanceof Date ? task.scheduledFor : new Date(task.scheduledFor)
      if (isNaN(start.getTime())) continue
      if (start <= now) continue
      if (start > windowEnd) continue
      candidates.push({ kind: 'task', entity: task, startTime: start })
    }

    if (candidates.length === 0) return null
    candidates.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    return candidates[0]
  }, [events, tasks, now, windowMinutes])
}
