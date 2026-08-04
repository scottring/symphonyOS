import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { Contact } from '@/types/contact'
import type { AttentionItem } from './attention'

// A single selected id, an array of selected ids (multi-select / union), or
// null/undefined/[] meaning "everyone". The pseudo-id 'unassigned' is allowed.
export type AssigneeFilter = string | readonly string[] | null | undefined

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
  /**
   * When set, completed tasks whose `updatedAt` is older than this timestamp
   * (ms epoch) are dropped from the *displayed* list — they linger briefly
   * after being checked off, then disappear. Counts are unaffected (they use
   * the full pool). Undefined = never hide completed (current desktop behavior).
   */
  completedLingerCutoff?: number
  /**
   * Start of the current week, per the user's `weekStartsOn`. Required: it is
   * the anchor `selectNeedsAttention` compares a `bucket='week'` task's own
   * `weekStart` against to decide "stranded" vs "still this week". A fallback
   * value here (e.g. substituting "today") would fabricate a wrong anchor and
   * misclassify a task correctly placed on the real current week — silently,
   * since every calendar-date compare "succeeds." Computed at the React
   * boundary (readCadenceConfig touches localStorage — this stays pure).
   */
  weekStart: Date
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
  /** Overdue but inside the grace window — Today's "Carried over" lane. */
  overdueTasks: Task[]
  /** Overdue past the grace window. Never rendered as Today rows: the page
   *  shows a single pointer line and the review surface owns the list. */
  slippedTasks: Task[]
  /** What needs attention, and why — Today's one bounded signal. Replaces the
   *  inbox/week/month pools, which were backlog rendered on an execution
   *  surface. */
  attentionItems: AttentionItem[]
  completedInboxTasks: Task[]
  grouped: Record<DaySection, TimelineItem[]>
  sectionsOrder: DaySection[]
  counts: TodayCounts
}

export const SECTIONS_ORDER: DaySection[] = [
  'allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled',
]

/**
 * A fully-keyed, empty section record. Use this instead of writing an object
 * literal — a hand-written literal is how five-key fixtures survived the
 * earlyMorning/night split and hid a real regression from every test. Callers
 * spread their own sections over the result:
 *
 *   { ...emptySections<TimelineItem>(), morning: [item] }
 */
export function emptySections<T>(): Record<DaySection, T[]> {
  const out = {} as Record<DaySection, T[]>
  for (const s of SECTIONS_ORDER) out[s] = []
  return out
}

export const EMPTY_TODAY_DATA: TodayData = {
  isToday: false,
  overdueTasks: [],
  slippedTasks: [],
  attentionItems: [],
  completedInboxTasks: [],
  grouped: emptySections<TimelineItem>(),
  sectionsOrder: SECTIONS_ORDER,
  counts: { completedCount: 0, incompleteOverdue: 0, actionableCount: 0, totalItems: 0, progressPercent: 0 },
}
