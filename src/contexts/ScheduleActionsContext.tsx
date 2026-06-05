import { createContext, useContext, type ReactNode } from 'react'
import type { Task, TaskContext, TaskLink } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Contact, ContactCategory } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { List, ListCategory } from '@/types/list'
import type { Routine } from '@/types/actionable'
import type { EventNote } from '@/hooks/useEventNotes'
import type { MeetingAttendee } from '@/hooks/useMeetingNotes'
import type { TimelineCaptureResult } from '@/components/schedule/TimelineQuickInput'

export interface ScheduleActionsValue {
  // Task actions
  onToggleTask: (taskId: string) => void
  onToggleWaiting?: (taskId: string) => void
  onUpdateTask?: (id: string, updates: Partial<Task>) => void
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void
  onDeleteTask?: (id: string) => void
  onCreateTask?: (title: string) => void
  onGroupTasks?: (
    taskIds: string[],
    groupName: string,
    date: Date,
    isAllDay: boolean,
  ) => Promise<void>
  onGroupItems?: (
    taskIds: string[],
    memberRefs: import('@/types/task').GroupMemberRef[],
    groupName: string,
    date: Date,
    isAllDay: boolean,
  ) => Promise<void>
  /** Show a transient toast (e.g. skip-report for bulk actions). Wired to App's toast. */
  onNotify?: (message: string) => void
  onCreateFollowUp?: (title: string, sourceTaskId: string) => void

  // Timeline insert-point create flows (radial wheel picks)
  onCreateTaskAt?: (r: TimelineCaptureResult) => void
  onCreateEventAt?: (r: TimelineCaptureResult) => void
  onCreateRoutineAt?: (r: TimelineCaptureResult) => void
  onCreateNoteAt?: (content: string, anchor: Date | null) => void
  onAppendNoteAt?: (id: string, block: string, anchor: Date | null) => void
  onLinkNote?: (id: string) => void
  timelineNotes?: { id: string; title?: string; content: string; timelineAt?: Date }[]
  onUpdateTasksBulk?: (taskIds: string[], updates: Partial<Task>) => Promise<void>
  onOpenTask?: (taskId: string) => void

  // Assignment actions
  onAssignTask?: (taskId: string, memberId: string | null) => void
  onAssignTaskAll?: (taskId: string, memberIds: string[]) => void
  onAssignEvent?: (eventId: string, memberId: string | null) => void
  onAssignEventAll?: (eventId: string, memberIds: string[]) => void
  onAssignRoutine?: (routineId: string, memberId: string | null) => void
  onAssignRoutineAll?: (routineId: string, memberIds: string[]) => void

  // Routine actions
  onCompleteRoutine?: (routineId: string, completed: boolean) => void
  onSkipRoutine?: (routineId: string) => void
  onPushRoutine?: (routineId: string, date: Date) => void
  onUpdateRoutine?: (id: string, updates: Partial<Routine>) => void
  onDeleteRoutine?: (routineId: string) => void

  // Event actions
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  onSkipEvent?: (eventId: string) => void
  onPushEvent?: (eventId: string, date: Date) => void
  onDeleteEvent?: (event: CalendarEvent) => void
  onUpdateEventContext?: (eventId: string, context: TaskContext | null) => void
  onHideEvent?: (googleEventId: string, title?: string, calendarId?: string) => Promise<boolean>

  // Reference data
  contactsMap?: Map<string, Contact>
  projectsMap?: Map<string, Project>
  projects: Project[]
  contacts: Contact[]
  familyMembers: FamilyMember[]
  lists: List[]
  listsByCategory?: Record<ListCategory, List[]>
  eventNotesMap?: Map<string, EventNote>
  eventContextOverrides?: Map<string, TaskContext>

  // List actions
  onSendToList?: (taskId: string, listId: string) => void
  onCreateList?: (title: string, category: ListCategory) => Promise<string | null>
  // links/phoneNumber widen this so convertTaskToProject can carry a task's context onto the new project
  onAddProject?: (project: { name: string; notes?: string; context?: 'work' | 'family' | 'personal'; links?: TaskLink[]; phoneNumber?: string }) => Promise<Project | null>
  /** Convert a task into a project: subtasks become the project's tasks, the parent task is deleted. */
  onConvertTaskToProject?: (taskId: string, details: { name: string; notes?: string; context?: TaskContext }) => Promise<Project | null>
  onDeleteProject?: (id: string) => Promise<void>
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string, details?: { phone?: string; category?: ContactCategory }) => Promise<Contact | null>
  onOpenProject?: (projectId: string) => void
  onOpenPlanning?: () => void

  // Calendar domain mapping
  getDomainForCalendar?: (calendarId?: string | null, calendarName?: string | null) => TaskContext | null

  // Navigation
  onRefreshInstances?: () => void
  onOpenChat?: () => void
  onOpenGuidedChat?: (entityType: 'task' | 'contact' | 'project' | 'event', entityId: string, entityName: string, prompt?: string) => void

  // Meeting
  onStartMeeting?: (eventId: string, title: string, attendees: MeetingAttendee[], startTime?: Date, endTime?: Date) => void

  // Event → Project promotion
  onUpdateEventProject?: (googleEventId: string, projectId: string | null, eventTitle?: string | null, eventStartTime?: Date | null) => void

  /** Reschedule a Google Calendar event (drag-to-move). Accepts new start + end (durations preserved by caller). */
  onUpdateEvent?: (eventId: string, updates: { startTime: Date; endTime: Date }) => Promise<void> | void
}

const ScheduleActionsContext = createContext<ScheduleActionsValue | null>(null)

export function ScheduleActionsProvider({ value, children }: { value: ScheduleActionsValue; children: ReactNode }) {
  return (
    <ScheduleActionsContext.Provider value={value}>
      {children}
    </ScheduleActionsContext.Provider>
  )
}

export function useScheduleActionsContext(): ScheduleActionsValue {
  const ctx = useContext(ScheduleActionsContext)
  if (!ctx) {
    throw new Error('useScheduleActionsContext must be used within a ScheduleActionsProvider')
  }
  return ctx
}
