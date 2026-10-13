import { describe, it, expect } from 'vitest'
import { eventsToCache, type CachedEventRow } from './cache.ts'

const row = (over: Partial<CachedEventRow> = {}): CachedEventRow => ({
  user_id: 'u1', google_event_id: 'e1', title: 'Boxing', description: null,
  start_time: '2026-10-13T13:00:00.000Z', end_time: '2026-10-13T14:00:00.000Z', all_day: false,
  location: null, meeting_url: null, calendar_id: 'c1', calendar_name: 'Family', calendar_color: '#336',
  recurring_event_id: null, attendees: [{ email: 'a@x.test', self: true, responseStatus: 'accepted' }],
  updated_at: '2026-10-13T15:00:00.000Z', ...over,
})

// Prod, 2026-10-13: every calendar read rewrote every event (277k updates on
// 1.3k rows). Only what is new or changed is written now.
describe('eventsToCache', () => {
  it('writes a new event', () => {
    expect(eventsToCache([row()], [])).toHaveLength(1)
  })

  it('skips an unchanged event, even when only updated_at and storage formats differ', () => {
    const stored = { ...row(), updated_at: '2026-10-01T00:00:00Z', start_time: '2026-10-13T13:00:00+00:00', end_time: '2026-10-13 14:00:00+00',
      // jsonb hands keys back in its own order
      attendees: [{ self: true, responseStatus: 'accepted', email: 'a@x.test' }] }
    expect(eventsToCache([row()], [stored])).toEqual([])
  })

  it('treats a missing description and an empty one as the same', () => {
    expect(eventsToCache([row({ description: '' })], [row({ description: null })])).toEqual([])
  })

  it('writes an event whose time, title or attendees changed', () => {
    const stored = [row()]
    expect(eventsToCache([row({ start_time: '2026-10-13T13:30:00.000Z' })], stored)).toHaveLength(1)
    expect(eventsToCache([row({ title: 'Boxing (moved)' })], stored)).toHaveLength(1)
    expect(eventsToCache([row({ attendees: [] })], stored)).toHaveLength(1)
  })

  it('only the changed ones of many', () => {
    const stored = [row({ google_event_id: 'a' }), row({ google_event_id: 'b' })]
    const out = eventsToCache([row({ google_event_id: 'a' }), row({ google_event_id: 'b', location: 'Gym' }), row({ google_event_id: 'c' })], stored)
    expect(out.map((r) => r.google_event_id)).toEqual(['b', 'c'])
  })
})
