import { describe, it, expect } from 'vitest'
import { markExisting, parseCaptureEvents } from './captureEvents'

// Scott's Southwest screenshot, 2026-10-30, as the vision call should read it.
const flights = [
  { title: 'Flight BWI → BOS (WN 2742)', start: '2026-12-04T17:10', end: '2026-12-04T18:45', start_zone: 'America/New_York', end_zone: 'America/New_York', location: 'BWI — Baltimore', who: ['Iris Leviner'], details: 'Confirmation 2ILYQY', url: 'southwest.com/manage' },
  { title: 'Flight BOS → BWI (WN 1717)', start: '2026-12-07T11:20', end: '2026-12-07T12:55', start_zone: 'America/New_York', end_zone: 'America/New_York', location: 'BOS — Boston Logan', who: ['Iris Leviner'], details: 'Confirmation 2ILYQY' },
]

describe('parseCaptureEvents', () => {
  it('reads a round trip as two timed events in UTC, with who and details', () => {
    const [out, back] = parseCaptureEvents(flights, 'America/Los_Angeles')
    expect(out).toMatchObject({ title: 'Flight BWI → BOS (WN 2742)', start: '2026-12-04T22:10:00.000Z', end: '2026-12-04T23:45:00.000Z', allDay: false, who: ['Iris Leviner'], location: 'BWI — Baltimore' })
    expect(out.details).toBe('Confirmation 2ILYQY\nhttps://southwest.com/manage')
    expect(back.start).toBe('2026-12-07T16:20:00.000Z')
  })

  it('lands a cross-country flight in its arrival zone', () => {
    const [e] = parseCaptureEvents([{ title: 'Flight BWI → LAX', start: '2026-12-04T08:00', end: '2026-12-04T10:45', start_zone: 'America/New_York', end_zone: 'America/Los_Angeles' }], 'America/New_York')
    expect(e.start).toBe('2026-12-04T13:00:00.000Z')
    expect(e.end).toBe('2026-12-04T18:45:00.000Z')
  })

  it('uses the person’s zone when the picture names no place, and keeps all-day dates as dates', () => {
    const [dentist, stay] = parseCaptureEvents([
      { title: 'Dentist', start: '2026-11-03T14:00', end: null, start_zone: 'Not/AZone' },
      { title: 'Hotel', start: '2026-12-04', end: '2026-12-07' },
    ], 'America/New_York')
    expect(dentist).toMatchObject({ start: '2026-11-03T19:00:00.000Z', end: null })
    expect(stay).toMatchObject({ start: '2026-12-04', end: '2026-12-07', allDay: true })
  })

  it('drops rows it cannot place and an end before the start', () => {
    const out = parseCaptureEvents([{ title: 'No time' }, { start: '2026-12-04T10:00' }, { title: 'Bad', start: 'Friday' }, { title: 'Backwards', start: '2026-12-04T10:00', end: '2026-12-04T09:00' }, 'junk'], 'UTC')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ title: 'Backwards', end: null })
    expect(parseCaptureEvents(null, 'UTC')).toEqual([])
  })
})

describe('markExisting', () => {
  // The cache rows Scott's calendar held on 2026-10-30.
  const cached = [
    { title: 'Flight to Boston (WN 2742)', start_time: '2026-12-04T22:10:00+00:00', calendar_name: 'smkaufman@gmail.com' },
    { title: 'Grampappa', start_time: '2026-12-04T21:00:00+00:00', calendar_name: 'Family' },
    { title: 'Flight to Baltimore (WN 1717)', start_time: '2026-12-07T16:20:00+00:00', calendar_name: 'smkaufman@gmail.com' },
  ]
  it('finds flights Gmail already added, by time and flight number', () => {
    const [out, back] = markExisting(parseCaptureEvents(flights, 'America/New_York'), cached)
    expect(out.existing).toEqual({ title: 'Flight to Boston (WN 2742)', calendarName: 'smkaufman@gmail.com' })
    expect(back.existing?.title).toBe('Flight to Baltimore (WN 1717)')
  })
  it('leaves alone a different thing at the same time, and the same thing at another time', () => {
    const [dinner] = markExisting(parseCaptureEvents([{ title: 'Dinner at Tio Pepe', start: '2026-12-04T17:10' }], 'America/New_York'), cached)
    expect(dinner.existing).toBeNull()
    const [later] = markExisting(parseCaptureEvents([{ title: 'Flight WN 2742', start: '2026-12-05T17:10' }], 'America/New_York'), cached)
    expect(later.existing).toBeNull()
  })
  it('matches an all-day event by its day', () => {
    const [stay] = markExisting(parseCaptureEvents([{ title: 'Marriott Boston stay', start: '2026-12-04' }], 'UTC'), [{ title: 'Boston Marriott', start_time: '2026-12-04T00:00:00+00:00', all_day: true }])
    expect(stay.existing?.title).toBe('Boston Marriott')
  })
})
