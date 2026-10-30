import { describe, it, expect } from 'vitest'
import { eventSpan, formatEventWhen, matchMembers } from './captureEvents'
import type { CaptureEvent } from '@/hooks/usePhotoCapture'

const ev = (o: Partial<CaptureEvent>): CaptureEvent => ({ title: 'x', start: '', end: null, allDay: false, location: null, who: [], details: null, ...o })

describe('capture events', () => {
  it('words a timed event in local time, with the day once', () => {
    const start = new Date(2026, 11, 4, 17, 10), end = new Date(2026, 11, 4, 18, 45)
    expect(formatEventWhen(ev({ start: start.toISOString(), end: end.toISOString() }))).toBe('Fri, Dec 4 · 5:10 PM – 6:45 PM')
    expect(formatEventWhen(ev({ start: start.toISOString() }))).toBe('Fri, Dec 4 · 5:10 PM')
  })

  it('reads an all-day date as that local day and gives it one day by default', () => {
    expect(formatEventWhen(ev({ allDay: true, start: '2026-12-04', end: '2026-12-07' }))).toBe('Fri, Dec 4 – Mon, Dec 7')
    const { start, end } = eventSpan(ev({ allDay: true, start: '2026-12-04' }))
    expect([start.getDate(), end.getDate()]).toEqual([4, 5])
  })

  it('a timed event with no end gets an hour', () => {
    const { start, end } = eventSpan(ev({ start: '2026-12-04T22:10:00.000Z' }))
    expect(end.getTime() - start.getTime()).toBe(3_600_000)
  })

  it('matches printed names to household members by first name', () => {
    const members = [{ id: 'm1', name: 'Scott' }, { id: 'm2', name: 'Iris' }, { id: 'm3', name: 'Ella' }]
    expect(matchMembers(['Iris Leviner'], members)).toEqual(['m2'])
    expect(matchMembers(['IRIS', 'scott kaufman'], members)).toEqual(['m1', 'm2'])
    expect(matchMembers(['Pat Smith'], members)).toEqual([])
  })
})
