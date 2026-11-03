// No school, no school routines (Scott, 2026-11-03: "today is labeled as no
// school election day at the top of the day view. But until I skipped them,
// it was still showing things like walk the kids to school, pick up the kids
// from school"). The calendar says it; the day believes it.
//
// A day is a no-school day when an all-day calendar entry covering it says so
// in plain words. On that day the routines named for school — and the steps
// of a school checklist — are off. Nothing is written: no skips, no instances.
// Today says what it left off and offers them back for the day (the calendar
// can be wrong).
//
// PURE: no React, no storage.

import type { Routine } from '@/types/actionable'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { eventDays } from '@/lib/week/journalSpread'
import { localYmd } from '@/lib/cadence/config'

/** "No school", "Schools closed", "No classes", a teacher work or
 *  professional-development day. An event merely named for a holiday
 *  ("Election Day") is not enough: plenty of holidays have school. */
const NO_SCHOOL = /\bno\s+school\b|\bschools?\s+(?:is\s+|are\s+)?closed\b|\bno\s+classes\b|\b(?:teacher|staff)\s+(?:work|planning|professional(?:\s+development)?)\s+day\b|\bprofessional\s+development\s+day\b|\bschool\s+holiday\b/i

/** The calendar entry that makes `day` a no-school day, or null. */
export function noSchoolReason(events: readonly CalendarEvent[], day: Date): string | null {
  const key = localYmd(day)
  for (const e of events) {
    if (!NO_SCHOOL.test(e.title ?? '')) continue
    // All-day entries only (a timed "no school assembly" is not the day).
    const span = eventDays(e)
    if (span?.allDay && span.first <= key && key <= span.last) return e.title.trim()
  }
  return null
}

/** A routine named for school: "Out the door, walk to school", "School
 *  pickup", "Home from school", "School morning". "After-school" and
 *  "homeschool" things are not school runs. */
const SCHOOL = /\bschool\b/i
const NOT_SCHOOL = /\bafter[\s-]school\b|\bhome\s?school/i
export const isSchoolRoutine = (r: Pick<Routine, 'name'>) => SCHOOL.test(r.name) && !NOT_SCHOOL.test(r.name)

/** The routines a no-school day leaves off: those named for school, and every
 *  step of a school checklist. */
export function schoolRoutinesOff<R extends Pick<Routine, 'id' | 'name' | 'parent_routine_id'>>(routines: readonly R[]): R[] {
  const named = new Set(routines.filter(isSchoolRoutine).map((r) => r.id))
  return routines.filter((r) => named.has(r.id) || (!!r.parent_routine_id && named.has(r.parent_routine_id)))
}
