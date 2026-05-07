import { useMemo } from 'react'
import { useSupabaseTasks } from './useSupabaseTasks'
import { useEventDiscussionFlags } from './useEventDiscussionFlags'
import { useGoogleCalendar } from './useGoogleCalendar'
import { useCalendarDomainMappings } from './useCalendarDomainMappings'
import type { Task } from '@/types/task'
import type { EventDiscussionFlag } from '@/types/eventDiscussion'
import type { CalendarEvent } from './useGoogleCalendar'

export interface DiscussionTaskItem {
  kind: 'task'
  id: string
  title: string
  note?: string
  task: Task
}

export interface DiscussionEventItem {
  kind: 'event'
  id: string
  title: string
  note?: string
  flag: EventDiscussionFlag
  event?: CalendarEvent
}

export type DiscussionItem = DiscussionTaskItem | DiscussionEventItem

export function useFamilyDiscussionItems() {
  const { tasks } = useSupabaseTasks()
  const { flags } = useEventDiscussionFlags()
  const { events } = useGoogleCalendar()
  const { getDomainForCalendar } = useCalendarDomainMappings()

  const taskItems = useMemo<DiscussionTaskItem[]>(() => {
    return tasks
      .filter((t) =>
        t.needsDiscussion &&
        !t.completed &&
        (t.context === 'family' || t.context === null || t.context === undefined)
      )
      .map((t) => ({
        kind: 'task' as const,
        id: t.id,
        title: t.title,
        note: t.discussionNote,
        task: t,
      }))
  }, [tasks])

  const eventItems = useMemo<DiscussionEventItem[]>(() => {
    return flags
      .filter((flag) => {
        const domain = getDomainForCalendar(flag.calendarId, undefined)
        return domain === 'family'
      })
      .map((flag) => {
        const event = events.find((e) => {
          const id = e.id || e.google_event_id || ''
          // Compare base ids
          const m = id.match(/^(.+)_\d{8}T\d{6}Z$/)
          const base = m ? m[1] : id
          return base === flag.googleEventBaseId
        })
        return {
          kind: 'event' as const,
          id: flag.googleEventBaseId,
          title: event?.title || flag.eventTitle || 'Untitled event',
          note: flag.discussionNote,
          flag,
          event,
        }
      })
  }, [flags, events, getDomainForCalendar])

  const items = useMemo<DiscussionItem[]>(() => {
    return [...taskItems, ...eventItems]
  }, [taskItems, eventItems])

  return { items, taskItems, eventItems, count: items.length }
}
