import { createContext, useContext, type ReactNode } from 'react'
import type { Task, TaskContext } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { List, ListCategory } from '@/types/list'
import type { Routine } from '@/types/actionable'
import type { EventNote } from '@/hooks/useEventNotes'
import type { PlaybookInstance, QuickReact, FamilyRule, DayType } from '@/types/playbook'
import type { EveningReflectionData } from '@/types/coaching'

export interface ScheduleActionsValue {
  // Task actions
  onToggleTask: (taskId: string) => void
  onToggleWaiting?: (taskId: string) => void
  onUpdateTask?: (id: string, updates: Partial<Task>) => void
  onPushTask?: (id: string, date: Date) => void
  onDeleteTask?: (id: string) => void
  onCreateTask?: (title: string) => void
  onCreateFollowUp?: (title: string, sourceTaskId: string) => void
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

  // Event actions
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  onSkipEvent?: (eventId: string) => void
  onPushEvent?: (eventId: string, date: Date) => void
  onUpdateEventContext?: (eventId: string, context: TaskContext | null) => void

  // Playbook actions
  playbookInstances?: PlaybookInstance[]
  onPlaybookToggleItem?: (instanceId: string, itemId: string) => void
  onPlaybookMarkDone?: (instanceId: string, completed?: boolean) => void
  onPlaybookReact?: (instanceId: string, react: QuickReact | null) => void
  onPlaybookTag?: (instanceId: string, tags: string[]) => void
  onPlaybookNote?: (instanceId: string, notes: string | null) => void
  onPlaybookEdit?: (block: PlaybookInstance['block']) => void
  onPlaybookDelete?: (blockId: string) => void
  onPlaybookSuppress?: (blockId: string, date: string) => void

  // Reference data
  contactsMap?: Map<string, Contact>
  projectsMap?: Map<string, Project>
  projects: Project[]
  contacts: Contact[]
  familyMembers: FamilyMember[]
  lists: List[]
  listsByCategory?: Record<ListCategory, List[]>
  eventNotesMap?: Map<string, EventNote>
  activeRules?: FamilyRule[]
  eventContextOverrides?: Map<string, TaskContext>

  // List actions
  onSendToList?: (taskId: string, listId: string) => void
  onCreateList?: (title: string, category: ListCategory) => Promise<string | null>
  onAddProject?: (project: { name: string }) => Promise<Project | null>
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string) => Promise<Contact | null>
  onOpenProject?: (projectId: string) => void
  onOpenPlanning?: () => void

  // Calendar domain mapping
  getDomainForCalendar?: (calendarId?: string | null, calendarName?: string | null) => TaskContext | null

  // Day type
  dayType?: DayType
  onDayTypeChange?: (dayType: DayType) => void

  // Evening reflections
  onSaveReflection?: (reflection: { highlight: string; notes: string }) => void
  todayReflection?: EveningReflectionData | null

  // Navigation
  onOpenWeeklyReview?: () => void
  onRefreshInstances?: () => void
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
