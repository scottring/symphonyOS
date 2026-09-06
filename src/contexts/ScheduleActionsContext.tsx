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
import type { TodayCaptureResult } from '@/components/schedule/TodayAddInput'
import type { ParserContext } from '@/lib/quickInputParser'
import type { ResolverContext } from '@/lib/entityResolver'

export interface ScheduleActionsValue {
  // Task actions
  onToggleTask: (taskId: string) => void
  onToggleWaiting?: (taskId: string) => void
  /** `false` means a domain gate was cancelled — nothing was written. A
   *  raw (non-gated) handler still type-checks here since it returns void,
   *  which is a member of the union; a caller that shows a success toast or
   *  records an undo MUST await and check for `false` (see wasWritten in
   *  useGatedTaskActions). */
  onUpdateTask?: (id: string, updates: Partial<Task>) => void | Promise<void | boolean>
  onPushTask?: (id: string, target: Date | 'week' | 'month' | 'quarter') => void | Promise<void | boolean>
  onDeleteTask?: (id: string) => void
  /** Mark or clear "needed today". Pass null to clear. */
  onSetNeededToday?: (taskId: string, neededOn: Date | null) => void
  /**
   * The day Today is currently showing (drives date nav). "Needed today" is
   * defined relative to THIS day, not the real calendar day — a mark expires
   * by ceasing to match it (see src/lib/today/neededToday.ts). Consumers that
   * check `neededOn` (the chip, the ⋯ menu) must compare against this, not
   * `new Date()`, or they'll disagree with the note when browsing a past/future
   * day.
   */
  viewedDate?: Date
  onCreateTask?: (title: string) => void
  onGroupTasks?: (
    taskIds: string[],
    groupName: string,
    date: Date,
    isAllDay: boolean,
  ) => Promise<void>
  /** Resolves with the new wrapper's task id — Today uses it to open the rename. */
  onGroupItems?: (
    taskIds: string[],
    memberRefs: import('@/types/task').GroupMemberRef[],
    groupName: string,
    date: Date,
    isAllDay: boolean,
  ) => Promise<string | undefined>
  /** Persist a reorder: a different sort_order per row, one round trip. */
  onReorderTasks?: (
    writes: import('@/lib/today/taskOrdering').OrderWrite[],
  ) => Promise<boolean>
  /**
   * Offer an undo for the action just performed. Surfaces as the toast the
   * container renders; the newest action wins.
   */
  onRegisterUndo?: (message: string, undo: () => void) => void
  /** Dissolve a group: detach every child, then delete the wrapper. */
  onUngroup?: (wrapperId: string, childIds: string[]) => Promise<void>
  /** Add members to a group that already exists (drag a card onto a group). */
  onAddToGroup?: (
    wrapperId: string,
    taskIds: string[],
    memberRefs: import('@/types/task').GroupMemberRef[],
    date: Date,
    isAllDay: boolean,
  ) => Promise<void>
  /** Detach one task from its group; it keeps its own schedule. */
  onRemoveFromGroup?: (taskId: string) => Promise<void>
  /** Show a transient toast (e.g. skip-report for bulk actions). Wired to App's toast. */
  onNotify?: (message: string) => void
  onCreateFollowUp?: (title: string, sourceTaskId: string) => void

  /** Needed Today "schedule a buy item": spawn a timed task linked to the
   *  list item (linkedTo type 'list_item'), so completing the task checks
   *  the item off its list. The item itself stays on the list. */
  onScheduleListItemAsTask?: (item: { id: string; title: string }, date: Date, isAllDay: boolean) => Promise<void>

  // Timeline insert-point create flows (radial wheel picks)
  onCreateTaskAt?: (r: TimelineCaptureResult) => void
  onCreateEventAt?: (r: TimelineCaptureResult) => void
  onCreateRoutineAt?: (r: TimelineCaptureResult) => void
  onCreateNoteAt?: (content: string, anchor: Date | null) => void
  onAppendNoteAt?: (id: string, block: string, anchor: Date | null) => void
  onLinkNote?: (id: string) => void
  timelineNotes?: { id: string; title?: string; content: string; timelineAt?: Date }[]
  onUpdateTasksBulk?: (taskIds: string[], updates: Partial<Task>) => Promise<void | boolean>
  onOpenTask?: (taskId: string) => void

  // Assignment actions
  /** `false` means a domain gate was cancelled — nothing was written. A raw
   *  (non-gated) sync handler still type-checks here since void is a member
   *  of the union. */
  onAssignTask?: (taskId: string, memberId: string | null) => void | Promise<void | boolean>
  onAssignTaskAll?: (taskId: string, memberIds: string[]) => void | Promise<void | boolean>
  onAssignEvent?: (eventId: string, memberId: string | null) => void
  onAssignEventAll?: (eventId: string, memberIds: string[]) => void
  onAssignRoutine?: (routineId: string, memberId: string | null) => void
  onAssignRoutineAll?: (routineId: string, memberIds: string[]) => void

  // Routine actions
  onCompleteRoutine?: (routineId: string, completed: boolean, completedAt?: Date) => void
  onSkipRoutine?: (routineId: string) => void
  onPushRoutine?: (routineId: string, date: Date, fromDate?: Date) => void
  onUpdateRoutine?: (id: string, updates: Partial<Routine>) => void
  onDeleteRoutine?: (routineId: string) => void

  // Event actions
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  onSkipEvent?: (eventId: string) => void
  onPushEvent?: (eventId: string, date: Date) => void
  onDeleteEvent?: (event: CalendarEvent) => void
  onUpdateEventContext?: (eventId: string, context: TaskContext | null) => void
  /** Key is freeKeyFor(event) — the series id when recurring, else the instance id. */
  onUpdateEventFree?: (key: string, free: boolean) => void
  onShareEventWithFamily?: (googleEventId: string) => void
  onDismissShareNudge?: (googleEventId: string) => void
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
  /** Convert a task into a "To buy" list item (task is deleted). Resolves with
   *  the created item's text and an undo, or null on failure. */
  onSendTaskToBuy?: (taskId: string) => Promise<{ itemText: string; undo: () => Promise<void> } | null>
  onCreateList?: (title: string, category: ListCategory) => Promise<string | null>
  // links/phoneNumber widen this so convertTaskToProject can carry a task's context onto the new project
  onAddProject?: (project: { name: string; notes?: string; context?: 'work' | 'family' | 'personal'; links?: TaskLink[]; phoneNumber?: string }) => Promise<Project | null>
  /** Convert a task into a project: subtasks become the project's tasks, the parent task is deleted. */
  onConvertTaskToProject?: (taskId: string, details: { name: string; notes?: string; context?: TaskContext }) => Promise<Project | null>
  onDeleteProject?: (id: string) => Promise<void>
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string, details?: { phone?: string; category?: ContactCategory }) => Promise<Contact | null>
  onOpenProject?: (projectId: string) => void

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

  /** Structured create from the smart Add-to-Today input. */
  onCreateTaskParsed?: (r: TodayCaptureResult) => void | Promise<void>
  /** Stable parser context for parse-aware inputs. */
  parserContext?: ParserContext
  /** Resolver inputs for implicit entity resolution. */
  resolverContext?: ResolverContext
  getRecentTaskForContact?: (contactId: string) => { title: string; date: Date } | null
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
