import { describe, it, expect } from 'vitest'
import { claimsIn, rhythmLine } from './periodClaims'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { localYmd } from '@/lib/cadence/config'

// Scott's November, as the Month sheet reads it (a Monday-start grid runs
// Oct 26 – Dec 6). "The school Specials for Ella and Kaleb do not belong in
// this calendar review" (Scott, 2026-11-04).
const FROM = new Date(2026, 9, 26)
const TO = new Date(2026, 11, 7)
const DAY = 86_400_000

let n = 0
const ev = (title: string, start: string, over: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id: `e${++n}`, title, start_time: start, ...over }) as CalendarEvent
const task = (o: Partial<Task>): Task =>
  ({ id: 't', title: 'T', completed: false, createdAt: FROM, updatedAt: FROM, ...o }) as Task

/** Every day in [from, to) whose weekday is in `days`, as YYYY-MM-DD. */
function daysOf(from: Date, to: Date, days: number[]): string[] {
  const out: string[] = []
  for (let t = from.getTime(); t < to.getTime(); t += DAY) {
    const d = new Date(t)
    if (days.includes(d.getDay())) out.push(localYmd(d))
  }
  return out
}

const SPECIALS = ['PE', 'Music', 'Art', 'Library', 'STEM']
const NOVEMBER: CalendarEvent[] = [
  // The specials rotation, every school day, all day.
  ...daysOf(FROM, TO, [1, 2, 3, 4, 5]).map((ymd, i) =>
    ev(`Specials — Ella: ${SPECIALS[i % 5]} · Kaleb: ${SPECIALS[(i + 2) % 5]}`, ymd, { all_day: true })),
  // Weekly timed series.
  ...daysOf(FROM, TO, [2, 4]).map((ymd) => ev('Boxing', `${ymd}T18:00:00`, { end_time: `${ymd}T19:00:00`, recurring_event_id: 'boxing' })),
  ...daysOf(FROM, TO, [2]).map((ymd) => ev('Marta', `${ymd}T10:00:00`, { end_time: `${ymd}T11:00:00`, recurring_event_id: 'marta' })),
  ...daysOf(FROM, TO, [2]).map((ymd) => ev('Coppermine', `${ymd}T16:00:00`, { end_time: `${ymd}T17:00:00`, recurring_event_id: 'coppermine' })),
  // What claims the month.
  ev('Halloween', '2026-10-31', { all_day: true, end_time: '2026-11-01' }),
  ev('Election Day', '2026-11-03T00:00:00+00:00', { all_day: true, end_time: '2026-11-04T00:00:00+00:00' }),
  ev('Ron staying with us', '2026-11-13', { all_day: true, end_time: '2026-11-16' }),
  ev('Birthday party', '2026-11-07T14:00:00', { end_time: '2026-11-07T16:00:00' }),
  ev('Picture day', '2026-11-05', { all_day: true, end_time: '2026-11-06', calendar_id: 'school' }),
  ev('Picture day', '2026-11-05', { all_day: true, end_time: '2026-11-06', calendar_id: 'family' }),
  ev('Pay FFG', '2026-11-10T09:00:00', { end_time: '2026-11-10T09:15:00', recurring_event_id: 'ffg' }),
  ev('Pay FFG', '2026-12-10T09:00:00', { end_time: '2026-12-10T09:15:00', recurring_event_id: 'ffg' }),
]

describe('claimsIn — what claims a planning period', () => {
  const { claims, rhythm } = claimsIn(NOVEMBER, [], FROM, TO)
  const titles = claims.map((c) => c.title)

  it('leaves out the specials rotation on school days', () => {
    expect(titles.some((t) => /specials/i.test(t))).toBe(false)
  })

  it('leaves out a weekly timed series (Boxing Tue/Thu) and names it in the rhythm instead', () => {
    expect(titles).not.toContain('Boxing')
    expect(titles).not.toContain('Marta')
    expect(titles).not.toContain('Coppermine')
    expect(rhythm.map((r) => `${r.title} ${r.days}`)).toEqual(['Boxing Tue & Thu', 'Marta Tue', 'Coppermine Tue'])
    expect(rhythmLine(rhythm)).toBe('Every week: Boxing Tue & Thu · Marta Tue · Coppermine Tue')
  })

  it('keeps all-day dates: Halloween and Election Day (on its calendar date, not UTC)', () => {
    const election = claims.find((c) => c.title === 'Election Day')
    expect(titles).toContain('Halloween')
    expect(election && localYmd(election.at)).toBe('2026-11-03')
    expect(election?.last).toBeUndefined()
  })

  it('keeps Ron staying Fri–Sun once, as a range', () => {
    const ron = claims.filter((c) => c.title === 'Ron staying with us')
    expect(ron).toHaveLength(1)
    expect(localYmd(ron[0].at)).toBe('2026-11-13')
    expect(ron[0].last && localYmd(ron[0].last)).toBe('2026-11-15')
  })

  it('keeps a one-off 2pm birthday party', () => {
    const party = claims.find((c) => c.title === 'Birthday party')
    expect(party?.allDay).toBe(false)
    expect(party?.at.getHours()).toBe(14)
  })

  it('keeps a monthly series (Pay FFG) on each of its dates in the period', () => {
    expect(claims.filter((c) => c.title === 'Pay FFG').map((c) => localYmd(c.at))).toEqual(['2026-11-10'])
    expect(claims.find((c) => c.title === 'Pay FFG')?.recurring).toBe(true)
  })

  it('counts one event on two calendars once', () => {
    expect(titles.filter((t) => t === 'Picture day')).toHaveLength(1)
  })

  it('is day-ordered, all-day first within a day', () => {
    expect(titles).toEqual(['Halloween', 'Election Day', 'Picture day', 'Birthday party', 'Pay FFG', 'Ron staying with us'])
  })

  it('Year keeps only landmarks, stretches and monthly/yearly series — not the one-off party', () => {
    const year = claimsIn(NOVEMBER, [], FROM, TO, { scope: 'year' }).claims.map((c) => c.title)
    expect(year).not.toContain('Birthday party')
    expect(year).toEqual(['Halloween', 'Election Day', 'Picture day', 'Pay FFG', 'Ron staying with us'])
  })

  it('keeps dated tasks, not completed ones or ones outside the period', () => {
    const out = claimsIn([], [
      task({ id: 'a', title: 'Book flights', scheduledFor: new Date(2026, 10, 9, 9) }),
      task({ id: 'b', title: 'Done already', scheduledFor: new Date(2026, 10, 9), completed: true }),
      task({ id: 'c', title: 'Later', scheduledFor: new Date(2027, 0, 9) }),
    ], FROM, TO).claims
    expect(out.map((c) => [c.title, c.kind, c.taskId])).toEqual([['Book flights', 'task', 'a']])
  })

  it('keeps a stretch that began before the period and runs into it; leaves out cancelled events', () => {
    const out = claimsIn([
      ev('Beach week', '2026-10-22', { all_day: true, end_time: '2026-10-29' }),
      ev('Gone before', '2026-10-20', { all_day: true, end_time: '2026-10-22' }),
      { ...ev('Called off', '2026-11-12T10:00:00'), status: 'cancelled' } as CalendarEvent,
    ], [], FROM, TO).claims
    expect(out.map((c) => c.title)).toEqual(['Beach week'])
  })

  it('a timed event of 20 hours or more is a stretch', () => {
    const [c] = claimsIn([ev('Ron (timed)', '2026-11-20T17:00:00', { end_time: '2026-11-22T15:00:00' })], [], FROM, TO).claims
    expect(c.last && localYmd(c.last)).toBe('2026-11-22')
  })
})

describe('rhythmLine', () => {
  it('names at most four series, then “and N more”; nothing when empty', () => {
    const r = ['A', 'B', 'C', 'D', 'E', 'F'].map((title) => ({ title, days: 'Mon' }))
    expect(rhythmLine(r)).toBe('Every week: A Mon · B Mon · C Mon · D Mon and 2 more')
    expect(rhythmLine([])).toBeNull()
  })

  it('reads every school day as “weekdays” and every day as “daily”', () => {
    const series = (title: string, days: number[], id: string) =>
      daysOf(FROM, TO, days).map((ymd) => ev(title, `${ymd}T07:30:00`, { recurring_event_id: id }))
    const { rhythm } = claimsIn([...series('Drop-off', [1, 2, 3, 4, 5], 'drop'), ...series('Meds', [0, 1, 2, 3, 4, 5, 6], 'meds')], [], FROM, TO)
    expect(rhythm.map((r) => `${r.title} ${r.days}`)).toEqual(['Meds daily', 'Drop-off weekdays'])
  })
})
