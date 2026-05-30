import { describe, it, expect } from 'vitest'
import { resolveEventContext } from './eventContext'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const ev = (p: Partial<CalendarEvent>): CalendarEvent =>
  ({ id: 'e1', title: 'Meeting', start_time: '', end_time: '', all_day: false, ...p } as CalendarEvent)

describe('resolveEventContext', () => {
  it('returns null when nothing resolves it (untagged)', () => {
    expect(resolveEventContext(ev({}))).toBeNull()
  })

  it('manual override wins over calendar mapping', () => {
    const overrides = new Map([['e1', 'personal' as const]])
    const map = () => 'work' as const
    expect(resolveEventContext(ev({ id: 'e1' }), overrides, map)).toBe('personal')
  })

  it('falls back to the calendar→domain mapping', () => {
    const map = (id?: string | null) => (id === 'work-cal' ? 'work' as const : null)
    expect(resolveEventContext(ev({ calendar_id: 'work-cal' }), undefined, map)).toBe('work')
    expect(resolveEventContext(ev({ calendar_id: 'other' }), undefined, map)).toBeNull()
  })

  it('prefers google_event_id for the override lookup', () => {
    const overrides = new Map([['g-123', 'family' as const]])
    expect(resolveEventContext(ev({ id: 'e1', google_event_id: 'g-123' }), overrides)).toBe('family')
  })
})
