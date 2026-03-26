import { useMemo, useEffect } from 'react'
import type { Task, LinkedActivityType } from '@/types/task'
import type { TimelineItem } from '@/types/timeline'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { EventNote } from '@/hooks/useEventNotes'
import type { Attachment } from '@/types/attachment'
import type { AttachmentEntityType } from '@/types/attachment'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'

interface UseDetailPanelStateParams {
  selectedItemId: string | null
  tasks: Task[]
  events: CalendarEvent[]
  activeRoutines: Routine[]
  allRoutines: Routine[]
  viewedDate: Date
  dateInstances: ActionableInstance[]
  getNote: (eventId: string) => EventNote | undefined
  eventNotesMap: Map<string, EventNote>
  contactsMap: Map<string, Contact>
  projectsMap: Map<string, Project>
  getLinkedTasks: (activityType: LinkedActivityType, activityId: string) => { prep: Task[], followup: Task[] }
  fetchNote: (eventId: string) => void
  fetchAttachments: (entityType: AttachmentEntityType, entityId: string) => Promise<Attachment[]>
  getAttachments: (entityType: AttachmentEntityType, entityId: string) => Attachment[]
}

interface UseDetailPanelStateReturn {
  selectedItem: TimelineItem | null
  selectedContact: Contact | null
  selectedItemProject: Project | null
  selectedEventRecipeUrl: string | null
  selectedEventAssignedToAll: string[]
  selectedEventProjectId: string | null
  selectedItemAttachments: Attachment[]
  selectedItemLinkedTasks: { prep: Task[], followup: Task[] }
  selectedItemRoutine: Routine | null
}

export function useDetailPanelState({
  selectedItemId,
  tasks,
  events,
  activeRoutines,
  allRoutines,
  viewedDate,
  dateInstances,
  getNote,
  eventNotesMap,
  contactsMap,
  projectsMap,
  getLinkedTasks,
  fetchNote,
  fetchAttachments,
  getAttachments,
}: UseDetailPanelStateParams): UseDetailPanelStateReturn {
  // Fetch event notes when an event is selected
  useEffect(() => {
    if (selectedItemId?.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      fetchNote(eventId)
    }
  }, [selectedItemId, fetchNote])

  // Fetch attachments when an item is selected
  useEffect(() => {
    if (selectedItemId?.startsWith('task-')) {
      const taskId = selectedItemId.replace('task-', '')
      fetchAttachments('task', taskId)
    } else if (selectedItemId?.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      fetchAttachments('event_note', eventId)
    }
  }, [selectedItemId, fetchAttachments])

  // Find selected item from tasks, events, or routines
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null

    // Check if it's a task
    if (selectedItemId.startsWith('task-')) {
      const taskId = selectedItemId.replace('task-', '')
      // Search top-level tasks and nested subtasks
      let task = tasks.find((t) => t.id === taskId)
      if (!task) {
        for (const t of tasks) {
          const sub = t.subtasks?.find((s) => s.id === taskId)
          if (sub) { task = sub; break }
        }
      }
      return task ? taskToTimelineItem(task) : null
    }

    // Check if it's an event
    if (selectedItemId.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      const event = events.find((e) => (e.google_event_id || e.id) === eventId)
      if (!event) return null

      const timelineItem = eventToTimelineItem(event)
      // Add user's notes from event_notes table
      const eventNote = getNote(eventId)
      if (eventNote?.notes) {
        timelineItem.notes = eventNote.notes
      }
      return timelineItem
    }

    // Check if it's a routine
    if (selectedItemId.startsWith('routine-')) {
      const routineId = selectedItemId.replace('routine-', '')
      const routine = activeRoutines.find((r) => r.id === routineId)
      if (!routine) return null

      // Create timeline item with the viewed date for time context
      const timelineItem = routineToTimelineItem(routine, viewedDate)

      // Check if there's an instance to update completion status
      const instance = dateInstances.find(
        (i) => i.entity_type === 'routine' && i.entity_id === routineId
      )
      if (instance?.status === 'completed') {
        timelineItem.completed = true
      }

      return timelineItem
    }

    return null
  }, [selectedItemId, tasks, events, activeRoutines, viewedDate, dateInstances, getNote])

  // Get contact for selected item
  const selectedContact = useMemo(() => {
    if (!selectedItem?.contactId) return null
    return contactsMap.get(selectedItem.contactId) ?? null
  }, [selectedItem, contactsMap])

  // Get project for selected item
  const selectedItemProject = useMemo(() => {
    if (!selectedItem?.projectId) return null
    return projectsMap.get(selectedItem.projectId) ?? null
  }, [selectedItem, projectsMap])

  // Get recipe URL for selected event
  const selectedEventRecipeUrl = useMemo(() => {
    if (!selectedItem?.originalEvent) return null
    const eventId = selectedItem.originalEvent.google_event_id || selectedItem.originalEvent.id
    const eventNote = eventNotesMap.get(eventId)
    return eventNote?.recipeUrl ?? null
  }, [selectedItem, eventNotesMap])

  // Get assigned family members for selected event
  const selectedEventAssignedToAll = useMemo(() => {
    if (!selectedItem?.originalEvent) return []
    const eventId = selectedItem.originalEvent.google_event_id || selectedItem.originalEvent.id
    const eventNote = eventNotesMap.get(eventId)
    return eventNote?.assignedToAll ?? []
  }, [selectedItem, eventNotesMap])

  // Get linked project for selected event
  const selectedEventProjectId = useMemo(() => {
    if (!selectedItem?.originalEvent) return null
    const eventId = selectedItem.originalEvent.google_event_id || selectedItem.originalEvent.id
    const eventNote = eventNotesMap.get(eventId)
    return eventNote?.projectId ?? null
  }, [selectedItem, eventNotesMap])

  // Get attachments for selected item
  const selectedItemAttachments = useMemo(() => {
    if (!selectedItemId) return []
    if (selectedItemId.startsWith('task-')) {
      const taskId = selectedItemId.replace('task-', '')
      return getAttachments('task', taskId)
    }
    if (selectedItemId.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      return getAttachments('event_note', eventId)
    }
    return []
  }, [selectedItemId, getAttachments])

  // Get linked tasks (prep/followup) for selected item
  const selectedItemLinkedTasks = useMemo(() => {
    if (!selectedItemId) return { prep: [], followup: [] }

    const dateStr = viewedDate.toISOString().split('T')[0]

    if (selectedItemId.startsWith('task-')) {
      const taskId = selectedItemId.replace('task-', '')
      return getLinkedTasks('task' as LinkedActivityType, taskId)
    }
    if (selectedItemId.startsWith('routine-')) {
      const routineId = selectedItemId.replace('routine-', '')
      const instanceId = `${routineId}_${dateStr}`
      return getLinkedTasks('routine_instance' as LinkedActivityType, instanceId)
    }
    if (selectedItemId.startsWith('event-')) {
      const eventId = selectedItemId.replace('event-', '')
      return getLinkedTasks('calendar_event' as LinkedActivityType, eventId)
    }
    return { prep: [], followup: [] }
  }, [selectedItemId, viewedDate, getLinkedTasks])

  // Get routine for selected routine item (for templates)
  const selectedItemRoutine = useMemo((): Routine | null => {
    if (!selectedItemId?.startsWith('routine-')) return null
    const routineId = selectedItemId.replace('routine-', '')
    return allRoutines.find(r => r.id === routineId) ?? null
  }, [selectedItemId, allRoutines])

  return {
    selectedItem,
    selectedContact,
    selectedItemProject,
    selectedEventRecipeUrl,
    selectedEventAssignedToAll,
    selectedEventProjectId,
    selectedItemAttachments,
    selectedItemLinkedTasks,
    selectedItemRoutine,
  }
}
