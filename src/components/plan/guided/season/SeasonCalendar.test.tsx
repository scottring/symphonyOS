import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

// The season's own calendar read (useSeasonEvents): what it holds, and the
// range it was actually read for (end exclusive).
const cal = vi.hoisted(() => ({ events: [] as unknown[], available: true, loading: false, failed: false, range: null as { start: number; end: number } | null, asked: [] as [Date, Date, boolean][] }))
vi.mock('@/hooks/useSeasonEvents', () => ({
  useSeasonEvents: (start: Date, end: Date, enabled: boolean) => { cal.asked.push([start, end, enabled]); return { events: cal.events, available: cal.available, loading: cal.loading, failed: cal.failed, range: cal.range } },
}))
const conn = vi.hoisted(() => ({ connected: true as boolean | null }))
vi.mock('@/lib/calendarConnection', () => ({ getCalendarConnected: () => conn.connected }))

import { MonthsCalendar, SeasonCalendar } from './SeasonCalendar'

const ev = (id: string, title: string, at: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title, start_time: at, ...over })
const at = (d: Date) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(d); onTestFinished(() => { vi.useRealTimers() }) }
const months = () => screen.getAllByRole('listitem', { name: /^(September|October|November|December|January|February)/ })

beforeEach(() => {
  cal.events = []; cal.available = true; cal.loading = false; cal.failed = false; cal.asked = []
  cal.range = { start: new Date(2026, 7, 25).getTime(), end: new Date(2026, 11, 31).getTime() }
  conn.connected = true
})

describe('SeasonCalendar — the season’s fixed dates, month by month', () => {
  it('lists the fixed events inside the season’s bounds (seasonBounds), by month; nothing outside it', () => {
    at(new Date(2026, 7, 28, 9)) // planning Fall before it starts
    cal.events = [
      ev('0', 'Late August trip', '2026-08-30', { all_day: true }),
      ev('1', 'School starts', '2026-09-08', { all_day: true }),
      ev('2', 'Dentist', '2026-10-06T09:30:00'),
      ev('3', 'Dentist', '2026-10-06T09:30:00', { calendar_id: 'other' }),
      ev('6', 'Race', '2026-10-10T09:00:00'),
      ev('7', 'Race', '2026-10-10T09:00:00', { calendar_id: 'other' }),
      ev('4', 'Thanksgiving', '2026-11-26', { all_day: true }),
      ev('5', 'Winter break', '2026-12-01', { all_day: true }),
    ]
    render(<SeasonCalendar date={new Date(2026, 9, 1)} seasons={DEFAULT_SEASONS} />)
    // Its own read, for the season's bounds.
    expect(cal.asked[0]).toEqual([new Date(2026, 8, 1), new Date(2026, 11, 1), true])
    expect(months().map((m) => m.getAttribute('aria-label'))).toEqual(['September', 'October', 'November'])
    expect(within(months()[0]).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Tue 8All day School starts'])
    // A weekday meeting is not a claim on the season (Scott, 2026-11-05);
    // a timed event on a weekend is, once across calendars.
    expect(within(months()[1]).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Sat 109:00 AM Race'])
    expect(screen.queryByText('Dentist')).toBeNull()
    expect(within(months()[2]).getByText('Thanksgiving')).toBeInTheDocument()
    expect(screen.queryByText('Late August trip')).toBeNull()
    expect(screen.queryByText('Winter break')).toBeNull()
    // Read only: what is missing is said in the conversation.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('a season already under way starts from today; a month past what was read says so rather than reading as empty', () => {
    at(new Date(2026, 9, 17, 9))
    cal.range = { start: new Date(2026, 9, 10).getTime(), end: new Date(2026, 10, 15).getTime() }
    cal.events = [ev('1', 'Fall fair', '2026-10-03', { all_day: true }), ev('2', 'Pumpkins', '2026-10-24', { all_day: true })]
    render(<SeasonCalendar date={new Date(2026, 9, 17)} seasons={DEFAULT_SEASONS} />)
    expect(months().map((m) => m.getAttribute('aria-label'))).toEqual(['October', 'November'])
    expect(screen.queryByText('Fall fair')).toBeNull()
    expect(within(months()[0]).getByText('Pumpkins')).toBeInTheDocument()
    expect(within(months()[1]).getByText('Nothing fixed')).toBeInTheDocument()
    // The read's end is exclusive: read up to Nov 15 is read through Nov 14.
    expect(within(months()[1]).getByText('The calendar was read through Nov 14')).toBeInTheDocument()
  })

  it('a month wholly past the calendar’s read says so', () => {
    at(new Date(2026, 7, 28, 9))
    cal.range = { start: new Date(2026, 7, 21).getTime(), end: new Date(2026, 9, 12).getTime() }
    render(<SeasonCalendar date={new Date(2026, 8, 1)} seasons={DEFAULT_SEASONS} />)
    expect(within(months()[0]).getByText('Nothing fixed')).toBeInTheDocument()
    expect(within(months()[2]).getByText('Past what the calendar was read for')).toBeInTheDocument()
  })

  it('a read that ends on a month’s first day covers the month before whole, and none of that month', () => {
    at(new Date(2026, 7, 28, 9))
    cal.range = { start: new Date(2026, 8, 1).getTime(), end: new Date(2026, 10, 1).getTime() }
    render(<SeasonCalendar date={new Date(2026, 8, 1)} seasons={DEFAULT_SEASONS} />)
    expect(within(months()[1]).queryByText(/read through/)).toBeNull()
    expect(within(months()[2]).getByText('Past what the calendar was read for')).toBeInTheDocument()
  })

  it('leaves out what comes round every week; keeps a monthly series, and a trip that began before the season and runs into it', () => {
    at(new Date(2026, 7, 28, 9))
    cal.events = [
      ev('w1', 'Soccer practice', '2026-09-02T17:00:00', { recurring_event_id: 'soccer' }),
      ev('w2', 'Soccer practice', '2026-09-09T17:00:00', { recurring_event_id: 'soccer' }),
      ev('m1', 'Tuition due', '2026-09-05', { all_day: true, recurring_event_id: 'tuition' }),
      ev('m2', 'Tuition due', '2026-10-05', { all_day: true, recurring_event_id: 'tuition' }),
      ev('t', 'Beach week', '2026-08-29', { all_day: true, end_time: '2026-09-04' }),
      ev('x', 'Gone before', '2026-08-20', { all_day: true, end_time: '2026-08-22' }),
    ]
    render(<SeasonCalendar date={new Date(2026, 8, 1)} seasons={DEFAULT_SEASONS} />)
    expect(screen.queryByText('Soccer practice')).toBeNull()
    expect(screen.queryByText('Gone before')).toBeNull()
    expect(within(months()[0]).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['From Aug 29All day · until Sep 3 Beach week', 'Sat 5All day Tuition due'])
    expect(within(months()[1]).getByText('Tuition due')).toBeInTheDocument()
  })

  it('the specials are out and the weekly series is one line; the year keeps only its landmarks', () => {
    at(new Date(2026, 9, 1, 9))
    cal.events = [
      ev('s1', 'Specials — Ella: PE · Kaleb: Music', '2026-10-05', { all_day: true }),
      ev('s2', 'Specials — Ella: Art · Kaleb: PE', '2026-10-06', { all_day: true }),
      ev('b1', 'Boxing', '2026-10-06T18:00:00', { recurring_event_id: 'boxing' }),
      ev('b2', 'Boxing', '2026-10-08T18:00:00', { recurring_event_id: 'boxing' }),
      ev('p', 'Birthday party', '2026-10-10T14:00:00'),
      ev('h', 'Halloween', '2026-10-31', { all_day: true }),
      ev('f1', 'Pay FFG', '2026-10-10T09:00:00', { recurring_event_id: 'ffg' }),
      ev('f2', 'Pay FFG', '2026-11-10T09:00:00', { recurring_event_id: 'ffg' }),
    ]
    const season = render(<SeasonCalendar date={new Date(2026, 9, 1)} seasons={DEFAULT_SEASONS} />)
    expect(document.body.textContent).not.toMatch(/Specials/)
    expect(screen.getByText('Every week: Boxing Tue & Thu')).toBeInTheDocument()
    expect(screen.getByText('Birthday party')).toBeInTheDocument()
    season.unmount()
    render(<MonthsCalendar start={new Date(2026, 0, 1)} end={new Date(2027, 0, 1)} allMonths scope="year" label="2026, month by month" over="2026 is over." />)
    expect(screen.queryByText('Birthday party')).toBeNull()
    expect(screen.getByText('Halloween')).toBeInTheDocument()
    expect(screen.getAllByText('Pay FFG')).toHaveLength(2)
  })

  it('loading, a read that failed, and no calendar connected each say so', () => {
    cal.available = false; cal.loading = true; cal.range = null
    const { unmount } = render(<SeasonCalendar date={new Date(2026, 9, 1)} seasons={DEFAULT_SEASONS} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading the calendar…')
    unmount()
    cal.loading = false; cal.failed = true
    const second = render(<SeasonCalendar date={new Date(2026, 9, 1)} seasons={DEFAULT_SEASONS} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The calendar couldn’t be read')
    second.unmount()
    conn.connected = false; cal.failed = false
    render(<SeasonCalendar date={new Date(2026, 9, 1)} seasons={DEFAULT_SEASONS} />)
    expect(screen.getByText('No calendar connected.')).toBeInTheDocument()
  })
})
