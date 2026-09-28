import { describe, it, expect, beforeEach, vi } from 'vitest'
import { lineFate, lineDropUpdates, endedIn, closeOutCandidates, landmarksIn, planV2Enabled } from './planV2'
import type { Task } from '@/types/task'
import { planPlacement } from '@/lib/placement/intentions'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const SEP = new Date(2026, 8, 1), OCT = new Date(2026, 9, 1), NOV = new Date(2026, 10, 1)
const task = (x: Partial<Task>): Task => ({ id: 't', title: 'T', completed: false, createdAt: new Date(), updatedAt: new Date(), ...x }) as Task
const c = (periodStart: Date, status: 'open' | 'done' | 'carried' | 'removed') => ({ level: 'month' as const, periodStart, status })

describe('lineFate', () => {
  it('reads each period off its own commitment', () => {
    const t = task({ bucket: 'month', commitments: [c(SEP, 'carried'), c(OCT, 'open')] })
    expect(lineFate(t, 'month', SEP, OCT)).toBe('carried')
    expect(lineFate(t, 'month', OCT, NOV)).toBe('open')
  })
  it('done wins over any commitment', () => {
    expect(lineFate(task({ completed: true, commitments: [c(SEP, 'open')] }), 'month', SEP, OCT)).toBe('done')
  })
  it('a removed commitment is dropped; someday is the bucket', () => {
    expect(lineFate(task({ commitments: [c(SEP, 'removed')] }), 'month', SEP, OCT)).toBe('dropped')
    expect(lineFate(task({ bucket: 'someday', commitments: [c(SEP, 'open')] }), 'month', SEP, OCT)).toBe('someday')
  })
  it('someday wins over the removed commitment its write leaves behind', () => {
    const parked = task({ bucket: 'someday', commitments: [c(SEP, 'removed')] })
    expect(lineFate(parked, 'month', SEP, OCT)).toBe('someday')
    expect(endedIn([parked], 'month', SEP, OCT)).toEqual([parked])
  })
  it('a legacy row with no records is open', () => {
    expect(lineFate(task({ bucket: 'month' }), 'month', SEP, OCT)).toBe('open')
  })
})

describe('endedIn / closeOutCandidates', () => {
  it('keeps the dropped record and asks only about open lines', () => {
    const open = task({ id: 'a', commitments: [c(SEP, 'open')] })
    const done = task({ id: 'b', completed: true, commitments: [c(SEP, 'open')] })
    const gone = task({ id: 'd', commitments: [c(SEP, 'removed')] })
    const carried = task({ id: 'e', commitments: [c(SEP, 'carried'), c(OCT, 'open')] })
    expect(endedIn([open, done, gone, carried], 'month', SEP, OCT).map((t) => t.id)).toEqual(['d'])
    expect(closeOutCandidates([open, done, carried], 'month', SEP, OCT).map((t) => t.id)).toEqual(['a'])
  })
})

describe('landmarksIn', () => {
  const ev = (x: Partial<CalendarEvent>): CalendarEvent => ({ id: Math.random().toString(), title: 'E', ...x }) as CalendarEvent
  it('keeps all-day and multi-day entries, not appointments', () => {
    const out = landmarksIn([
      ev({ title: 'Yom Kippur', start_time: '2026-09-21', end_time: '2026-09-22', all_day: true }),
      ev({ title: 'Call', start_time: '2026-09-25T07:00:00', end_time: '2026-10-01T19:00:00' }),
      ev({ title: 'Dentist', start_time: '2026-09-29T10:00:00', end_time: '2026-09-29T11:00:00' }),
    ], SEP, OCT)
    expect(out.map((l) => l.title)).toEqual(['Yom Kippur', 'Call'])
    expect(out[0].end.getDate()).toBe(21) // an all-day end is exclusive
    expect(out[1].end.getMonth()).toBe(9) // the stretch runs into October
  })
  it('reads an all-day timestamp as its calendar date, not UTC midnight', () => {
    const [l] = landmarksIn([ev({ title: 'Election Day', start_time: '2026-11-03T00:00:00+00:00', end_time: '2026-11-04T00:00:00+00:00', all_day: true })], NOV, new Date(2026, 11, 1))
    expect([l.start.getDate(), l.end.getDate()]).toEqual([3, 3])
  })
  it('counts one event on two calendars once', () => {
    const a = { title: 'No school', start_time: '2026-09-21', all_day: true }
    expect(landmarksIn([ev(a), ev(a)], SEP, OCT)).toHaveLength(1)
  })
})

describe('planV2Enabled', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllEnvs() })
  it('is off by default and remembers ?plan=v2 / ?plan=v1', () => {
    expect(planV2Enabled('')).toBe(false)
    expect(planV2Enabled('?plan=v2')).toBe(true)
    expect(planV2Enabled('')).toBe(true)
    expect(planV2Enabled('?plan=v1')).toBe(false)
    expect(planV2Enabled('')).toBe(false)
  })
  it('the build flag makes it the default', () => {
    vi.stubEnv('VITE_PLAN_V2', 'true')
    expect(planV2Enabled('')).toBe(true)
  })
})

describe('lineDropUpdates (a month line put down on its calendar)', () => {
  const WK = new Date(2026, 8, 27), DAY = new Date(2026, 8, 30)
  const wk = (periodStart: Date) => ({ level: 'week' as const, periodStart, status: 'open' as const })
  const ops = (t: Task, u: Partial<Task>) => planPlacement(t, u, { now: new Date(2026, 8, 28), userId: 'u' }).commitmentOps
    .map((o) => `${o.op} ${o.level} ${o.periodStart.getDate()}`)

  it('a week keeps the month and adds that week — even off a day', () => {
    const dated = task({ bucket: 'timed', scheduledFor: DAY, isAllDay: true, commitments: [c(SEP, 'open')] })
    const u = lineDropUpdates(dated, { kind: 'week', at: WK })
    expect('commitments' in u).toBe(false)
    expect(u).toMatchObject({ bucket: 'week', weekStart: WK, scheduledFor: undefined })
    expect(ops(dated, u)).toEqual(expect.arrayContaining(['ensure week 27']))
    expect(ops(dated, u)).not.toContain('remove month 1')
  })
  it('a day dates it and keeps the month', () => {
    const t = task({ bucket: 'month', commitments: [c(SEP, 'open')] })
    const u = lineDropUpdates(t, { kind: 'day', at: DAY })
    expect(u).toMatchObject({ scheduledFor: DAY, isAllDay: true, bucket: 'timed' })
    expect(ops(t, u)).not.toContain('remove month 1')
  })
  it('back on the list: the week and the day go, the month stays', () => {
    const t = task({ bucket: 'timed', scheduledFor: DAY, isAllDay: true, commitments: [c(SEP, 'open'), wk(WK)] })
    const u = lineDropUpdates(t, { kind: 'list' })
    expect(u.scheduledFor).toBeUndefined()
    expect(ops(t, u)).toContain('remove week 27')
    expect(ops(t, u)).not.toContain('remove month 1')
  })
})
