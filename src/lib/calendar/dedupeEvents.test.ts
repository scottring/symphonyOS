import { describe, it, expect } from 'vitest'
import { dedupeCalendarEvents } from './dedupeEvents'

const ev = (title: string, start: string | null, extra: Record<string, unknown> = {}) =>
  ({ title, start_time: start, ...extra }) as { title: string; start_time: string | null }

describe('dedupeCalendarEvents', () => {
  it('collapses the same meeting synced to two calendars', () => {
    const out = dedupeCalendarEvents([
      ev('School — Ella & Kaleb', '2026-08-31T11:30:00Z'),
      ev('School — Ella & Kaleb', '2026-08-31T11:30:00Z'),
    ])
    expect(out).toHaveLength(1)
  })

  it('matches across offset forms of the same instant', () => {
    // The bug that makes a raw-string key useless: identical moment, two
    // serialisations, one from the primary calendar and one from a group.
    const out = dedupeCalendarEvents([
      ev('Standup', '2026-08-31T09:00:00-04:00'),
      ev('Standup', '2026-08-31T13:00:00Z'),
    ])
    expect(out).toHaveLength(1)
  })

  it('keeps the first copy, so caller ordering decides the survivor', () => {
    const out = dedupeCalendarEvents([
      ev('Dinner', '2026-08-31T22:30:00Z', { calendar_name: 'Family' }),
      ev('Dinner', '2026-08-31T22:30:00Z', { calendar_name: 'Personal' }),
    ]) as Array<{ calendar_name?: string }>
    expect(out[0].calendar_name).toBe('Family')
  })

  it('keeps same-titled events at different times', () => {
    const out = dedupeCalendarEvents([
      ev('Pickup', '2026-08-31T18:00:00Z'),
      ev('Pickup', '2026-09-01T18:00:00Z'),
    ])
    expect(out).toHaveLength(2)
  })

  it('keeps differently-titled events at the same time', () => {
    const out = dedupeCalendarEvents([
      ev('School', '2026-08-31T11:30:00Z'),
      ev('Specials', '2026-08-31T11:30:00Z'),
    ])
    expect(out).toHaveLength(2)
  })

  it('reads camelCase startTime as well as start_time', () => {
    const out = dedupeCalendarEvents([
      { title: 'X', startTime: '2026-08-31T11:30:00Z' },
      { title: 'X', startTime: '2026-08-31T11:30:00Z' },
    ])
    expect(out).toHaveLength(1)
  })

  it('never drops an event with no start — it cannot be compared', () => {
    const out = dedupeCalendarEvents([
      ev('No start', null),
      ev('No start', null),
    ])
    expect(out).toHaveLength(2)
  })
})
