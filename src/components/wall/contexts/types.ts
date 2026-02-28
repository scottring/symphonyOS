import type { WallDayData } from '@/hooks/useWallData'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'

// ============================================================================
// CONTEXT RULE DEFINITIONS
// ============================================================================

export interface ContextTimeWindow {
  /** Start hour (0-23). e.g. 17 = 5 PM */
  startHour: number
  /** Start minute (0-59) */
  startMinute?: number
  /** End hour (0-23). e.g. 19 = 7 PM */
  endHour: number
  /** End minute (0-59) */
  endMinute?: number
}

export type ContextConditionFn = (data: ContextEvalData) => boolean

export interface ContextRule {
  id: string
  /** Display label for the smart button */
  label: string
  /** Emoji icon for the button */
  icon: string
  /** Time window when this context can surface */
  timeWindow: ContextTimeWindow
  /** Optional extra condition (e.g. "only if dinner event exists") */
  condition?: ContextConditionFn
  /** Which view component to render */
  viewId: ContextViewId
  /** Priority (higher = shown first if multiple rules match) */
  priority: number
  /** Minutes the button stays visible after first surfacing (0 = until window ends) */
  ttlMinutes?: number
  /** Accent color for the button */
  color: string
}

// ============================================================================
// CONTEXT VIEWS
// ============================================================================

export type ContextViewId =
  | 'dinner-flow'
  | 'morning-launch'
  | 'after-school'
  | 'bedtime'
  | 'weekend-morning'

// ============================================================================
// DATA PASSED TO RULES + VIEWS
// ============================================================================

export interface ContextEvalData {
  now: Date
  days: WallDayData[]
  calendarEvents: CalendarEvent[]
  familyMembers: FamilyMember[]
  overdueTasks: TimelineItem[]
  todayChores: TimelineItem[]
  todayTasks: TimelineItem[]
}

export interface ContextViewProps {
  data: ContextEvalData
  onDismiss: () => void
}

// ============================================================================
// ACTIVE CONTEXT STATE
// ============================================================================

export interface ActiveContext {
  ruleId: string
  viewId: ContextViewId
  activatedAt: Date
}

export interface DismissedContext {
  ruleId: string
  dismissedAt: Date
}
