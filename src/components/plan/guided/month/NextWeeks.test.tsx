import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

// The calendar the planning day tiles read (useDayLoadEvents): what it holds,
// and the range it was actually read for.
const cal = vi.hoisted(() => ({ events: [] as unknown[], available: true, loading: false, failed: false, range: null as { start: number; end: number } | null, enabled: [] as boolean[] }))
vi.mock('@/hooks/useDayLoadEvents', () => ({
  useDayLoadEvents: (enabled: boolean) => { cal.enabled.push(enabled); return { events: cal.events, available: cal.available, loading: cal.loading, failed: cal.failed, range: cal.range } },
}))
const conn = vi.hoisted(() => ({ connected: true as boolean | null }))
vi.mock('@/lib/calendarConnection', () => ({ getCalendarConnected: () => conn.connected }))

import { NextWeeks } from './NextWeeks'

const start = new Date(2026, 10, 1) // Sunday, Nov 1
const ev = (id: string, title: string, at: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title, start_time: at, ...over })

beforeEach(() => {
  cal.events = []; cal.available = true; cal.loading = false; cal.failed = false; cal.enabled = []
  cal.range = { start: new Date(2026, 9, 25).getTime(), end: new Date(2026, 11, 14).getTime() }
  conn.connected = true
})

describe('NextWeeks — the next 4–5 weeks, fixed dates week by week', () => {
  it('lists each week’s fixed events from the planning calendar, all-day first, one meeting once', () => {
    cal.events = [
      ev('1', 'Dentist', '2026-11-03T09:30:00'),
      ev('2', 'Thanksgiving', '2026-11-26', { all_day: true }),
      ev('3', 'Dentist', '2026-11-03T09:30:00', { calendar_id: 'other' }),
      ev('4', 'School play', '2026-11-03', { all_day: true }),
      ev('5', 'Too far', '2026-12-20T10:00:00'),
    ]
    render(<NextWeeks start={start} weeks={5} />)
    expect(cal.enabled.every(Boolean)).toBe(true)
    const weeks = screen.getAllByRole('listitem', { name: /^Week of / })
    expect(weeks.map((w) => w.getAttribute('aria-label'))).toEqual(['Week of Nov 1', 'Week of Nov 8', 'Week of Nov 15', 'Week of Nov 22', 'Week of Nov 29'])
    const first = within(weeks[0])
    expect(first.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Tue 3All day School play', 'Tue 39:30 AM Dentist'])
    expect(within(weeks[3]).getByText('Thanksgiving')).toBeInTheDocument()
    expect(within(weeks[1]).getByText('Nothing fixed')).toBeInTheDocument()
    expect(screen.queryByText('Too far')).toBeNull()
    // Read only: what changes is said in the conversation.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('a week past what the calendar was read for says so instead of reading as empty', () => {
    cal.range = { start: new Date(2026, 9, 25).getTime(), end: new Date(2026, 10, 20).getTime() }
    render(<NextWeeks start={start} weeks={5} />)
    expect(within(screen.getByRole('listitem', { name: 'Week of Nov 8' })).getByText('Nothing fixed')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Week of Nov 22' })).getByText('Past what the calendar was read for')).toBeInTheDocument()
  })

  it('loading, a read that failed, and no calendar connected each say so', () => {
    cal.available = false; cal.loading = true; cal.range = null
    const { unmount } = render(<NextWeeks start={start} weeks={5} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading the calendar…')
    unmount()
    cal.loading = false; cal.failed = true
    const second = render(<NextWeeks start={start} weeks={5} />)
    expect(screen.getByRole('alert')).toHaveTextContent('The calendar couldn’t be read')
    second.unmount()
    conn.connected = false; cal.failed = false
    render(<NextWeeks start={start} weeks={5} />)
    expect(screen.getByText('No calendar connected.')).toBeInTheDocument()
  })
})
