import { describe, it, expect } from 'vitest'
import { filterOutEvent } from './calendarEventCache'
import type { CalendarEvent } from './useGoogleCalendar'

// Regression for 2026-06-12: the google-calendar-events edge function returns
// events WITHOUT an `id` field (only google_event_id), so every cached event
// has id === undefined. Optimistically removing "by id undefined" matched the
// undefined id on every event and wiped the whole Today list.
const events = [
  { google_event_id: 'g1', title: 'Interview' },
  { google_event_id: 'g2', title: 'CrossFit' },
  { id: 'db3', google_event_id: 'g3', title: 'Marta' },
] as CalendarEvent[]

describe('filterOutEvent', () => {
  it('removes only the event whose google_event_id matches', () => {
    const out = filterOutEvent(events, 'g2')
    expect(out.map((e) => e.google_event_id)).toEqual(['g1', 'g3'])
  })

  it('removes by db id when that is what matches', () => {
    const out = filterOutEvent(events, 'db3')
    expect(out.map((e) => e.google_event_id)).toEqual(['g1', 'g2'])
  })

  it('returns the list unchanged for undefined id (no mass eviction)', () => {
    expect(filterOutEvent(events, undefined as unknown as string)).toHaveLength(3)
  })

  it('returns the list unchanged for empty-string id', () => {
    expect(filterOutEvent(events, '')).toHaveLength(3)
  })

  it('never matches events via their own undefined fields', () => {
    // events[0] has no `id`; removing 'g3' must not touch it even though
    // events[0].id === undefined
    const out = filterOutEvent(events, 'g3')
    expect(out.map((e) => e.title)).toEqual(['Interview', 'CrossFit'])
  })
})
