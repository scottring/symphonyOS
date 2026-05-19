import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { Contact } from '@/types/contact'

export type AssigneeFilter = string | null | undefined

export interface TodayDataInput {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  viewedDate: Date
  selectedAssignee: AssigneeFilter
  hideRoutines: boolean
  eventNotesMap?: Map<string, { notes?: string; assignedTo?: string | null }>
  eventContextOverrides?: Map<string, 'work' | 'family' | 'personal'>
  getDomainForCalendar?: (calendarId?: string, calendarName?: string) => 'work' | 'family' | 'personal' | null
  /** Present for parity with legacy deps; not used by current logic. */
  projectsMap?: Map<string, { name: string }>
  contactsMap?: Map<string, Contact>
}

export interface TodayCounts {
  completedCount: number
  incompleteOverdue: number
  actionableCount: number
  totalItems: number
  progressPercent: number
}

export interface TodayData {
  isToday: boolean
  overdueTasks: Task[]
  inboxTasks: Task[]
  weekTasks: Task[]
  completedInboxTasks: Task[]
  grouped: Record<DaySection, TimelineItem[]>
  sectionsOrder: DaySection[]
  counts: TodayCounts
}

export const SECTIONS_ORDER: DaySection[] = ['allday', 'morning', 'afternoon', 'evening', 'unscheduled']

export const EMPTY_TODAY_DATA: TodayData = {
  isToday: false,
  overdueTasks: [],
  inboxTasks: [],
  weekTasks: [],
  completedInboxTasks: [],
  grouped: { allday: [], morning: [], afternoon: [], evening: [], unscheduled: [] },
  sectionsOrder: SECTIONS_ORDER,
  counts: { completedCount: 0, incompleteOverdue: 0, actionableCount: 0, totalItems: 0, progressPercent: 0 },
}
