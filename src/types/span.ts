import type { Scope } from '@/lib/scope'
import type { TaskContext } from './task'

/**
 * A planning container with explicit start and end dates.
 *
 * The week is the default planning unit, but real life has units the calendar
 * grid can't express — a three-day weekend, a school break, the days around a
 * trip. Those straddle a week boundary, so planning them "in the week of the
 * 7th" both splits them and buries them.
 *
 * A span is a week placement generalised: `bucket` says which horizon a task
 * is on, and a stamp says which one of that horizon. A week stamps
 * `weekStart`; a span stamps `spanId`.
 *
 * Dates are LOCAL calendar days, not instants. A span is "Sat 5th to Mon 7th"
 * the way a person means it, so both ends are INCLUSIVE.
 */
export interface Span {
  id: string
  userId: string
  name: string
  /** Inclusive first day, local midnight. */
  startDate: Date
  /** Inclusive last day, local midnight. */
  endDate: Date
  context: TaskContext | null
  /** DERIVED by scopeForDomain, never chosen — RLS reads this and nothing else. */
  scope: Scope
  createdAt: Date
  updatedAt: Date
}

/** What creating or editing a span needs. The rest is derived or defaulted. */
export interface SpanInput {
  name: string
  startDate: Date
  endDate: Date
  context?: TaskContext | null
}
