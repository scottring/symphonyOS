// The reverse of the id that `eventToTimelineItem` builds.
//
// Scott's walkthrough, 2026-09-24: dragging an event in the Week Schedule
// picked it up, moved it, and snapped it back. The drop handler matched
// `ev.id === <the google id>` — the wrong id space — found nothing, and
// returned in silence.
//
// The fixtures here carry BOTH ids, and one carries no `id` at all, because
// that is the shape a real calendar event has. The old unit fixture had only
// `id`, so it matched and the test passed while the app failed.
import { describe, it, expect } from 'vitest'
import { findEventByItemId, eventItemId, eventItemKey, eventToTimelineItem } from './timeline'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const party = {
  id: 'row-uuid-1',
  google_event_id: 'goog_pippa_123',
  title: "Pippa's birthday party",
  start_time: new Date(2026, 8, 25, 13, 0).toISOString(),
  end_time: new Date(2026, 8, 25, 14, 0).toISOString(),
} as CalendarEvent

// "cached events from the edge function have no `id` field"
// — useGoogleCalendar.tsx, restoreEventLocal
const cached = {
  google_event_id: 'goog_cached_456',
  title: 'Cached meeting',
} as unknown as CalendarEvent

const local = { id: 'local-only-789', title: 'Local only' } as CalendarEvent

describe('findEventByItemId', () => {
  it('finds the event the block was built from', () => {
    const item = eventToTimelineItem(party)
    expect(item.id).toBe('event-goog_pippa_123')
    expect(findEventByItemId([party], item.id)).toBe(party)
  })

  // The exact failure: the google id was looked up in the row-id field.
  it('does not require the row id to be the Google id', () => {
    expect(party.id).not.toBe(party.google_event_id)
    expect(findEventByItemId([party], eventItemId(party))).toBe(party)
  })

  it('finds an event that has no row id at all', () => {
    const item = eventToTimelineItem(cached)
    expect(item.id).toBe('event-goog_cached_456')
    expect(findEventByItemId([cached], item.id)).toBe(cached)
  })

  it('still finds an event that only has a row id', () => {
    expect(findEventByItemId([local], eventItemId(local))).toBe(local)
  })

  it('picks the right one out of a mixed list', () => {
    const all = [local, party, cached]
    expect(findEventByItemId(all, eventItemId(party))).toBe(party)
    expect(findEventByItemId(all, eventItemId(cached))).toBe(cached)
    expect(findEventByItemId(all, eventItemId(local))).toBe(local)
  })

  it('finds nothing rather than guessing', () => {
    expect(findEventByItemId([party], 'event-nope')).toBeUndefined()
    expect(findEventByItemId([party], 'task-row-uuid-1')).toBeUndefined()
    expect(findEventByItemId([party], 'event-')).toBeUndefined()
  })

  // An event with neither id yields "event-undefined"; that must not match
  // another event in the same state.
  it('never matches one unaddressable event to another', () => {
    const ghost = { title: 'No ids' } as CalendarEvent
    expect(eventItemKey(ghost)).toBeUndefined()
    expect(findEventByItemId([ghost], 'event-undefined')).toBeUndefined()
  })
})
