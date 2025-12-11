/**
 * Constants for entity types, statuses, and other string literals
 *
 * Using constants instead of string literals provides:
 * - Type safety with autocomplete
 * - Single source of truth
 * - Easier refactoring
 * - No typos in string literals
 */

// Entity types for actionable items
export const ENTITY_TYPE = {
  CALENDAR_EVENT: 'calendar_event',
  ROUTINE: 'routine',
} as const

export type EntityTypeValue = typeof ENTITY_TYPE[keyof typeof ENTITY_TYPE]

// Linked activity types (what tasks can be linked to)
export const LINKED_ACTIVITY_TYPE = {
  TASK: 'task',
  ROUTINE_INSTANCE: 'routine_instance',
  CALENDAR_EVENT: 'calendar_event',
} as const

export type LinkedActivityTypeValue = typeof LINKED_ACTIVITY_TYPE[keyof typeof LINKED_ACTIVITY_TYPE]

// Actionable item statuses
export const ACTIONABLE_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  DEFERRED: 'deferred',
} as const

export type ActionableStatusValue = typeof ACTIONABLE_STATUS[keyof typeof ACTIONABLE_STATUS]

// Coverage request statuses
export const COVERAGE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
} as const

export type CoverageStatusValue = typeof COVERAGE_STATUS[keyof typeof COVERAGE_STATUS]

// Routine visibility options
export const ROUTINE_VISIBILITY = {
  ACTIVE: 'active',
  REFERENCE: 'reference',
} as const

export type RoutineVisibilityValue = typeof ROUTINE_VISIBILITY[keyof typeof ROUTINE_VISIBILITY]

// Recurrence types
export const RECURRENCE_TYPE = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
  SPECIFIC_DAYS: 'specific_days',
} as const

export type RecurrenceTypeValue = typeof RECURRENCE_TYPE[keyof typeof RECURRENCE_TYPE]

// Task context types
export const TASK_CONTEXT = {
  WORK: 'work',
  FAMILY: 'family',
  PERSONAL: 'personal',
} as const

export type TaskContextValue = typeof TASK_CONTEXT[keyof typeof TASK_CONTEXT]

// Project statuses
export const PROJECT_STATUS = {
  NOT_STARTED: 'not_started',
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const

export type ProjectStatusValue = typeof PROJECT_STATUS[keyof typeof PROJECT_STATUS]

// List categories
export const LIST_CATEGORY = {
  ENTERTAINMENT: 'entertainment',
  FOOD_DRINK: 'food_drink',
  SHOPPING: 'shopping',
  TRAVEL: 'travel',
  FAMILY_INFO: 'family_info',
  HOME: 'home',
  OTHER: 'other',
} as const

export type ListCategoryValue = typeof LIST_CATEGORY[keyof typeof LIST_CATEGORY]

// List visibility
export const LIST_VISIBILITY = {
  SELF: 'self',
  FAMILY: 'family',
} as const

export type ListVisibilityValue = typeof LIST_VISIBILITY[keyof typeof LIST_VISIBILITY]

// Defer options
export const DEFER_OPTION = {
  TOMORROW: 'tomorrow',
  NEXT_WEEK: 'next_week',
  NEXT_OCCURRENCE: 'next_occurrence',
  NEXT_MONTH: 'next_month',
  CUSTOM: 'custom',
} as const

export type DeferOptionValue = typeof DEFER_OPTION[keyof typeof DEFER_OPTION]

// Days of week (short form used in recurrence patterns)
export const DAY_OF_WEEK = {
  SUN: 'sun',
  MON: 'mon',
  TUE: 'tue',
  WED: 'wed',
  THU: 'thu',
  FRI: 'fri',
  SAT: 'sat',
} as const

export type DayOfWeekValue = typeof DAY_OF_WEEK[keyof typeof DAY_OF_WEEK]

// All days of the week in order (Sunday to Saturday)
export const DAYS_OF_WEEK = [
  DAY_OF_WEEK.SUN,
  DAY_OF_WEEK.MON,
  DAY_OF_WEEK.TUE,
  DAY_OF_WEEK.WED,
  DAY_OF_WEEK.THU,
  DAY_OF_WEEK.FRI,
  DAY_OF_WEEK.SAT,
] as const

// Weekdays only
export const WEEKDAYS = [
  DAY_OF_WEEK.MON,
  DAY_OF_WEEK.TUE,
  DAY_OF_WEEK.WED,
  DAY_OF_WEEK.THU,
  DAY_OF_WEEK.FRI,
] as const

// Weekend days only
export const WEEKEND_DAYS = [
  DAY_OF_WEEK.SAT,
  DAY_OF_WEEK.SUN,
] as const
