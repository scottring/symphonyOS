import { describe, it, expect } from 'vitest'
import { parseReminders, zonedToUtc, reminderRows } from './captureReminders'

// Scott, 2026-10-04: the jury summons said to call after 5 PM the night before
// to confirm service. That instruction should arrive as a task at that time,
// with the number to tap — not sit in the note.
describe('zonedToUtc', () => {
  it('reads a wall-clock time in the user’s zone, across daylight saving', () => {
    expect(zonedToUtc('2026-10-04T17:00', 'America/New_York')).toBe('2026-10-04T21:00:00.000Z')
    expect(zonedToUtc('2026-12-01T17:00:00', 'America/New_York')).toBe('2026-12-01T22:00:00.000Z')
    expect(zonedToUtc('2026-10-14', 'America/Los_Angeles')).toBe('2026-10-14T07:00:00.000Z')
  })
})

describe('parseReminders', () => {
  it('keeps well-formed reminders and drops the rest', () => {
    expect(parseReminders([
      { title: 'Call 410-333-1555 to confirm jury service', when: '2026-10-04T17:00', phone: '410-333-1555', url: 'www.baltimorecitycourt.org' },
      { title: 'Complete the juror form', when: '2026-10-14' },
      { title: '', when: '2026-10-04' },
      { title: 'No date', when: 'the night before' },
    ])).toEqual([
      { title: 'Call 410-333-1555 to confirm jury service', when: '2026-10-04T17:00', allDay: false, phone: '410-333-1555', url: 'https://www.baltimorecitycourt.org' },
      { title: 'Complete the juror form', when: '2026-10-14', allDay: true },
    ])
    expect(parseReminders('nope')).toEqual([])
  })
})

describe('reminderRows', () => {
  const base = {
    userId: 'u1', timeZone: 'America/New_York', context: 'personal', scope: 'private',
    captureTitle: 'Jury Duty Summons — Oct 5', now: new Date('2026-10-04T16:00:00Z'),
  }

  it('one timed task per reminder, carrying the number and site to tap', () => {
    const rows = reminderRows(parseReminders([
      { title: 'Call to confirm jury service', when: '2026-10-04T17:00', phone: '410-333-1555', url: 'https://www.baltimorecitycourt.org' },
      { title: 'Complete the juror form', when: '2026-10-14' },
    ]), base)
    expect(rows).toEqual([
      {
        user_id: 'u1', title: 'Call to confirm jury service', bucket: 'timed',
        scheduled_for: '2026-10-04T21:00:00.000Z', is_all_day: false,
        phone_number: '410-333-1555', links: [{ url: 'https://www.baltimorecitycourt.org' }],
        notes: 'From your photo: Jury Duty Summons — Oct 5', context: 'personal', scope: 'private',
      },
      {
        user_id: 'u1', title: 'Complete the juror form', bucket: 'timed',
        scheduled_for: '2026-10-14T04:00:00.000Z', is_all_day: true,
        notes: 'From your photo: Jury Duty Summons — Oct 5', context: 'personal', scope: 'private',
      },
    ])
  })

  it('skips a reminder whose moment has passed, but keeps one due later today', () => {
    const rows = reminderRows(parseReminders([
      { title: 'Already gone', when: '2026-10-04T09:00' },
      { title: 'Today, no time', when: '2026-10-04' },
    ]), base)
    expect(rows.map((r) => r.title)).toEqual(['Today, no time'])
  })
})
