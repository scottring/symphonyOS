import { describe, it, expect } from 'vitest'
import { computeShareNudges } from './shareNudges'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'

// Wednesday 2026-06-10. 19:00 = family hours; 10:00 = working hours.
const at = (h: number) => new Date(2026, 5, 10, h, 0).toISOString()
const ev = (id: string, start: string, extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id, title: `Event ${id}`, start_time: start, ...extra })

// All events resolve to 'work' via this stub (calendar mapping).
const work = () => 'work' as const
const noOverrides = undefined
const noNotes = undefined

describe('computeShareNudges', () => {
  it('nudges a work event during family hours', () => {
    const out = computeShareNudges([ev('1', at(19))], noNotes, noOverrides, work)
    expect(out).toEqual([{ eventId: '1', title: 'Event 1', context: 'work' }])
  })
  it('does not nudge a work event during working hours', () => {
    expect(computeShareNudges([ev('1', at(10))], noNotes, noOverrides, work)).toEqual([])
  })
  it('does not nudge family-tagged events', () => {
    expect(computeShareNudges([ev('1', at(19))], noNotes, noOverrides, () => 'family')).toEqual([])
  })
  it('skips all-day events', () => {
    expect(computeShareNudges([ev('1', at(19), { all_day: true })], noNotes, noOverrides, work)).toEqual([])
  })
  it('skips events already shared', () => {
    const notes = new Map<string, EventNote>([['1', { id: 'n', googleEventId: '1', notes: null, sharedWithFamily: true, createdAt: new Date(), updatedAt: new Date() }]])
    expect(computeShareNudges([ev('1', at(19))], notes, noOverrides, work)).toEqual([])
  })
  it('skips events whose nudge was dismissed', () => {
    const notes = new Map<string, EventNote>([['1', { id: 'n', googleEventId: '1', notes: null, shareNudgeDismissed: true, createdAt: new Date(), updatedAt: new Date() }]])
    expect(computeShareNudges([ev('1', at(19))], notes, noOverrides, work)).toEqual([])
  })
})
