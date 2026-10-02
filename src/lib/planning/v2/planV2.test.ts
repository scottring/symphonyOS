import { describe, it, expect, beforeEach, vi } from 'vitest'
import { lineFate, lineDropUpdates, endedIn, closeOutCandidates, landmarksIn, planV2Enabled, lookBackOpen, renamedForPeriod, dayNamedIn } from './planV2'
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
  it('leaves out the school specials rotation — a daily reminder, not a date', () => {
    const out = landmarksIn([
      ev({ title: 'Specials — Ella: PE · Kaleb: Music', start_time: '2026-10-01', end_time: '2026-10-02', all_day: true }),
      ev({ title: 'Specials: Ella: Art · Kaleb: PE', start_time: '2026-10-02', end_time: '2026-10-03', all_day: true }),
      ev({ title: 'No School', start_time: '2026-10-16', end_time: '2026-10-17', all_day: true }),
      ev({ title: 'Special Olympics', start_time: '2026-10-17', end_time: '2026-10-18', all_day: true }),
    ], OCT, NOV)
    expect(out.map((l) => l.title)).toEqual(['No School', 'Special Olympics'])
  })
  it('leaves out an all-day series that repeats weekly or more often; keeps a monthly one', () => {
    const day = (ymd: string, title: string, series: string) => ev({ title, start_time: ymd, all_day: true, recurring_event_id: series })
    const out = landmarksIn([
      day('2026-10-06', 'Trash day', 'trash'), day('2026-10-13', 'Trash day', 'trash'), day('2026-10-20', 'Trash day', 'trash'),
      day('2026-10-10', 'Tuition due', 'tuition'), day('2026-11-10', 'Tuition due', 'tuition'),
      day('2026-10-22', 'Mom’s birthday', 'bday'),
    ], OCT, new Date(2026, 11, 1))
    expect(out.map((l) => l.title)).toEqual(['Tuition due', 'Mom’s birthday', 'Tuition due'])
  })
})

describe('planV2Enabled', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllEnvs() })
  it('is on by default and remembers ?plan=v1 / ?plan=v2', () => {
    expect(planV2Enabled('')).toBe(true)
    expect(planV2Enabled('?plan=v1')).toBe(false)
    expect(planV2Enabled('')).toBe(false)
    expect(planV2Enabled('?plan=v2')).toBe(true)
    expect(planV2Enabled('')).toBe(true)
  })
  it('a build with VITE_PLAN_V2=false turns it off', () => {
    vi.stubEnv('VITE_PLAN_V2', 'false')
    expect(planV2Enabled('')).toBe(false)
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

describe('lookBackOpen (walkthrough 2026-10-02 #34)', () => {
  const octEnd = new Date(2026, 10, 1) // October's exclusive end
  it('a month is not closed out with weeks still to run', () => {
    expect(lookBackOpen('month', octEnd, new Date(2026, 9, 2))).toBe(false)
  })
  it('a month opens its look-back in its last week, and after', () => {
    expect(lookBackOpen('month', octEnd, new Date(2026, 9, 25))).toBe(true)
    expect(lookBackOpen('month', octEnd, new Date(2026, 10, 3))).toBe(true)
  })
  it('a week opens on its last day', () => {
    const wkEnd = new Date(2026, 9, 3) // week Sep 26 – Oct 2
    expect(lookBackOpen('week', wkEnd, new Date(2026, 9, 1))).toBe(false)
    expect(lookBackOpen('week', wkEnd, new Date(2026, 9, 2, 18))).toBe(true)
  })
})

describe('renamedForPeriod', () => {
  it('swaps the old period’s name for the new one', () => {
    expect(renamedForPeriod('Come up with October business plan', 'October', 'November')).toBe('Come up with November business plan')
  })
  it('leaves a title that does not name it', () => {
    expect(renamedForPeriod('Talk to Tim', 'October', 'November')).toBeNull()
  })
})

describe('dayNamedIn (walkthrough 2026-10-02 #20)', () => {
  const wk41 = new Date(2026, 9, 3) // Sat Oct 3 – Fri Oct 9
  const fri2 = new Date(2026, 9, 2)
  it('reads a weekday in the line as that day of the week being planned', () => {
    expect(dayNamedIn('Talk to Tim on Monday', wk41, fri2)).toEqual(new Date(2026, 9, 5))
  })
  it('ignores a line with no weekday, and abbreviations', () => {
    expect(dayNamedIn('Sat down with the budget', wk41, fri2)).toBeNull()
    expect(dayNamedIn('Call the bank', wk41, fri2)).toBeNull()
  })
  it('ignores a day already past', () => {
    expect(dayNamedIn('Call Tim Monday', wk41, new Date(2026, 9, 7))).toBeNull()
  })
})
