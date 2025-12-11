// Actionable Items System Types

export type EntityType = 'calendar_event' | 'routine'
export type ActionableStatus = 'pending' | 'completed' | 'skipped' | 'deferred'
export type CoverageStatus = 'pending' | 'accepted' | 'declined'
export type RoutineVisibility = 'active' | 'reference'

// Recurrence pattern types
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'specific_days'

export interface RecurrencePattern {
  type: RecurrenceType
  days?: string[] // For weekly: ['mon', 'wed', 'fri']
  day_of_month?: number // For monthly: 1-31
  month_of_year?: number // For yearly: 1-12
  dates?: string[] // For specific_days: ['2025-01-01', '2025-07-04']
  interval?: number // Every N days/weeks/months (e.g., 2 = every other)
  start_date?: string // Reference date for interval calculations (YYYY-MM-DD)
}

// Database row types
export interface ActionableInstance {
  id: string
  user_id: string
  entity_type: EntityType
  entity_id: string
  date: string // ISO date string (YYYY-MM-DD)
  status: ActionableStatus
  assignee: string | null
  assigned_to_override: string | null // Family member override for this instance
  deferred_to: string | null // ISO timestamp
  completed_at: string | null
  skipped_at: string | null
  created_at: string
  updated_at: string
}

export interface InstanceNote {
  id: string
  instance_id: string
  user_id: string
  note: string
  created_at: string
}

export interface CoverageRequest {
  id: string
  instance_id: string
  requested_by: string
  covered_by: string | null
  status: CoverageStatus
  requested_at: string
  responded_at: string | null
}

// Template for auto-generating prep/follow-up tasks
export interface PrepFollowupTemplate {
  id: string // UUID for tracking
  title: string
  defaultScheduleOffset?: 'same_day' | 'day_before' | 'day_after' // Optional, for future use
}

export interface Routine {
  id: string
  user_id: string
  name: string
  description: string | null
  default_assignee: string | null
  assigned_to: string | null // Family member assignment - legacy single
  assigned_to_all: string[] | null // Multi-member assignment
  visibility: RoutineVisibility
  recurrence_pattern: RecurrencePattern
  time_of_day: string | null // HH:MM:SS format
  raw_input: string | null // Original natural language input
  show_on_timeline: boolean // Whether to display on Today view (default true)
  // Templates for auto-generation of linked tasks
  prep_task_templates?: PrepFollowupTemplate[]
  followup_task_templates?: PrepFollowupTemplate[]
  created_at: string
  updated_at: string
}

// Defer options based on context
export type DeferOption = {
  label: string
  value: 'tomorrow' | 'next_week' | 'next_occurrence' | 'next_month' | 'custom'
  targetDate?: Date // Pre-calculated for non-custom options
}

// Helper to get defer options based on recurrence
export function getDeferOptions(recurrence?: RecurrencePattern): DeferOption[] {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0) // Default to 9am

  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)
  nextWeek.setHours(9, 0, 0, 0)

  const nextMonth = new Date()
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  nextMonth.setHours(9, 0, 0, 0)

  // Base options available for all types
  const baseOptions: DeferOption[] = [
    { label: 'Tomorrow', value: 'tomorrow', targetDate: tomorrow },
  ]

  if (!recurrence || recurrence.type === 'daily') {
    // Daily or no recurrence: Tomorrow, Custom
    return [
      ...baseOptions,
      { label: 'Custom...', value: 'custom' },
    ]
  }

  if (recurrence.type === 'weekly') {
    // Weekly: Tomorrow, Next week, Custom
    return [
      ...baseOptions,
      { label: 'Next week', value: 'next_week', targetDate: nextWeek },
      { label: 'Custom...', value: 'custom' },
    ]
  }

  if (recurrence.type === 'monthly') {
    // Monthly: Tomorrow, Next month, Custom
    return [
      ...baseOptions,
      { label: 'Next month', value: 'next_month', targetDate: nextMonth },
      { label: 'Custom...', value: 'custom' },
    ]
  }

  if (recurrence.type === 'quarterly') {
    // Quarterly: Tomorrow, Next quarter, Custom
    const nextQuarter = new Date()
    nextQuarter.setMonth(nextQuarter.getMonth() + 3)
    nextQuarter.setHours(9, 0, 0, 0)
    return [
      ...baseOptions,
      { label: 'Next quarter', value: 'next_month', targetDate: nextQuarter },
      { label: 'Custom...', value: 'custom' },
    ]
  }

  if (recurrence.type === 'yearly') {
    // Yearly: Tomorrow, Next year, Custom
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)
    nextYear.setHours(9, 0, 0, 0)
    return [
      ...baseOptions,
      { label: 'Next year', value: 'next_month', targetDate: nextYear },
      { label: 'Custom...', value: 'custom' },
    ]
  }

  if (recurrence.type === 'specific_days') {
    // Specific days: Tomorrow, Next occurrence, Custom
    // Next occurrence would need to be calculated based on the dates array
    return [
      ...baseOptions,
      { label: 'Next occurrence', value: 'next_occurrence' },
      { label: 'Custom...', value: 'custom' },
    ]
  }

  return baseOptions
}

// For calendar events without RRULE parsing, use simplified options
export function getCalendarEventDeferOptions(): DeferOption[] {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)

  const nextWeek = new Date()
  nextWeek.setDate(nextWeek.getDate() + 7)
  nextWeek.setHours(9, 0, 0, 0)

  return [
    { label: 'Tomorrow', value: 'tomorrow', targetDate: tomorrow },
    { label: 'Next week', value: 'next_week', targetDate: nextWeek },
    { label: 'Custom...', value: 'custom' },
  ]
}
