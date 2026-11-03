import { describe, expect, it } from 'vitest'
import { isSchoolRoutine, noSchoolReason, schoolRoutinesOff } from './noSchool'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const tue = new Date(2026, 10, 3, 9, 0)
// As the calendar function sends all-day entries: noon UTC, exclusive end.
const allDay = (title: string, start: string, end?: string): CalendarEvent => ({ id: title, title, start_time: `${start}T12:00:00.000Z`, end_time: end ? `${end}T12:00:00.000Z` : undefined, all_day: true })

describe('noSchoolReason', () => {
  it('an all-day "No school" entry on the day makes it a no-school day', () => {
    expect(noSchoolReason([allDay('No school — Election Day', '2026-11-03', '2026-11-04')], tue)).toBe('No school — Election Day')
    expect(noSchoolReason([allDay('Schools closed (snow)', '2026-11-03')], tue)).toBe('Schools closed (snow)')
    expect(noSchoolReason([allDay('Teacher professional development day', '2026-11-03')], tue)).not.toBeNull()
  })

  it('covers every day of a multi-day break, and not the day it ends', () => {
    const ev = allDay('Thanksgiving break - no school', '2026-11-25', '2026-11-28')
    expect(noSchoolReason([ev], new Date(2026, 10, 25))).not.toBeNull()
    expect(noSchoolReason([ev], new Date(2026, 10, 27))).not.toBeNull()
    expect(noSchoolReason([ev], new Date(2026, 10, 28))).toBeNull()
  })

  it('a holiday by name alone, another day, or a timed entry is not enough', () => {
    expect(noSchoolReason([allDay('Election Day', '2026-11-03')], tue)).toBeNull()
    expect(noSchoolReason([allDay('No school', '2026-11-04')], tue)).toBeNull()
    expect(noSchoolReason([{ id: 'x', title: 'No school assembly', start_time: '2026-11-03T14:00:00', end_time: '2026-11-03T15:00:00', all_day: false }], tue)).toBeNull()
  })
})

describe('school routines', () => {
  it('names for school, not after-school or homeschool', () => {
    expect(isSchoolRoutine({ name: 'Out the door, walk to school' })).toBe(true)
    expect(isSchoolRoutine({ name: 'School pickup' })).toBe(true)
    expect(isSchoolRoutine({ name: 'Home from school' })).toBe(true)
    expect(isSchoolRoutine({ name: 'After-school snack' })).toBe(false)
    expect(isSchoolRoutine({ name: 'Pick up from FFG and walk home' })).toBe(false)
  })

  it('a school checklist goes with all its steps', () => {
    const rs = [
      { id: 'm', name: 'School morning', parent_routine_id: null },
      { id: 'm1', name: 'Breakfast on the table', parent_routine_id: 'm' },
      { id: 'w', name: 'Water the plants', parent_routine_id: null },
    ]
    expect(schoolRoutinesOff(rs).map((r) => r.id)).toEqual(['m', 'm1'])
  })
})
