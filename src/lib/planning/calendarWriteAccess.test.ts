import { describe, it, expect } from 'vitest'
import { makeCanMoveEvent } from './calendarWriteAccess'
import type { CalendarEvent, GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'

function cal(partial: Partial<GoogleCalendarInfo> & { id: string }): GoogleCalendarInfo {
  return {
    summary: partial.id,
    email: 'smkaufman@gmail.com',
    accessRole: 'owner',
    primary: false,
    ...partial,
  }
}

function event(partial: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    title: 'Something',
    start_time: '2026-08-05T14:00:00Z',
    end_time: '2026-08-05T15:00:00Z',
    ...partial,
  } as CalendarEvent
}

const CALENDARS = [
  cal({ id: 'primary-cal', primary: true, accessRole: 'owner' }),
  cal({ id: 'family-cal', accessRole: 'writer' }),
  // The real-world case: a work calendar shared in view-only. Google 403s
  // every write to it.
  cal({ id: 'work-cal', accessRole: 'reader' }),
]

describe('makeCanMoveEvent', () => {
  it('allows an event on a calendar we own', () => {
    const canMove = makeCanMoveEvent(CALENDARS)
    expect(canMove(event({ id: 'e1', calendar_id: 'primary-cal' }))).toBe(true)
  })

  it('allows an event on a calendar shared with write access', () => {
    const canMove = makeCanMoveEvent(CALENDARS)
    expect(canMove(event({ id: 'e2', calendar_id: 'family-cal' }))).toBe(true)
  })

  it('refuses an event on a view-only calendar — Google would 403 the write', () => {
    const canMove = makeCanMoveEvent(CALENDARS)
    expect(canMove(event({ id: 'e3', calendar_id: 'work-cal' }))).toBe(false)
  })

  it('treats a missing calendar_id as the primary calendar, which is ours', () => {
    const canMove = makeCanMoveEvent(CALENDARS)
    expect(canMove(event({ id: 'e4' }))).toBe(true)
  })

  it('reads camelCase calendarId too — the hook emits both shapes', () => {
    const canMove = makeCanMoveEvent(CALENDARS)
    expect(canMove(event({ id: 'e5', calendarId: 'work-cal' }))).toBe(false)
    expect(canMove(event({ id: 'e6', calendarId: 'family-cal' }))).toBe(true)
  })

  // Safety defaults: never gamble a 403 to show one more grip.
  it('refuses everything before the calendar list has loaded', () => {
    const canMove = makeCanMoveEvent([])
    expect(canMove(event({ id: 'e7', calendar_id: 'primary-cal' }))).toBe(false)
  })

  it('refuses an unrecognised calendar id (unshared since, or stale cache)', () => {
    const canMove = makeCanMoveEvent(CALENDARS)
    expect(canMove(event({ id: 'e8', calendar_id: 'gone-cal' }))).toBe(false)
  })

  // A day-grain move keeps the clock time and changes the date. An all-day
  // event has no clock time, so the drop handler refuses it — offering a grip
  // would produce a drag that silently does nothing.
  it('refuses an all-day event, which has no clock time to preserve', () => {
    const canMove = makeCanMoveEvent(CALENDARS)
    expect(canMove(event({ id: 'e9', calendar_id: 'primary-cal', all_day: true }))).toBe(false)
    expect(canMove(event({ id: 'e10', calendar_id: 'primary-cal', allDay: true }))).toBe(false)
  })
})
