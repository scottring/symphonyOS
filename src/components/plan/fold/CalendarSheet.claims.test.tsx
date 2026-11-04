import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

// The Month sheet's calendar read (useDayLoadEvents), as November holds it.
const cal = vi.hoisted(() => ({ events: [] as unknown[], range: null as { start: number; end: number } | null }))
vi.mock('@/hooks/useDayLoadEvents', () => ({
  useDayLoadEvents: () => ({ events: cal.events, available: true, loading: false, failed: false, range: cal.range }),
}))
vi.mock('@/lib/calendarConnection', () => ({ getCalendarConnected: () => true }))

import { CalendarSheet, MonthGrid } from './CalendarSheet'
import { NextWeeks } from '@/components/plan/guided/month/NextWeeks'

const NOV = new Date(2026, 10, 1)
const ev = (id: string, title: string, at: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title, start_time: at, ...over })
const school = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']
const boxing = ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12']
const dots = (ymd: string) => document.querySelectorAll(`td[data-day="${ymd}"] .cal-sheet-dots i`).length

beforeEach(() => {
  cal.range = { start: new Date(2026, 9, 25).getTime(), end: new Date(2026, 11, 14).getTime() }
  cal.events = [
    ...school.map((d, i) => ev(`s${i}`, `Specials — Ella: ${i % 2 ? 'PE' : 'Art'} · Kaleb: Music`, d, { all_day: true })),
    ...boxing.map((d, i) => ev(`b${i}`, 'Boxing', `${d}T18:00:00`, { end_time: `${d}T19:00:00`, recurring_event_id: 'boxing' })),
    ev('e', 'Election Day', '2026-11-03', { all_day: true, end_time: '2026-11-04' }),
    ev('p', 'Birthday party', '2026-11-07T14:00:00', { end_time: '2026-11-07T16:00:00' }),
    ev('r', 'Ron staying with us', '2026-11-13', { all_day: true, end_time: '2026-11-16' }),
  ]
})

describe('the Month calendar sheet — what claims November', () => {
  it('has no specials; the weekly series is one quiet line; dots count only claims', () => {
    render(<CalendarSheet kicker="What’s already claimed" title="November">
      <MonthGrid month={NOV} weekStartsOn={0} />
      <NextWeeks start={NOV} weeks={5} />
    </CalendarSheet>)

    expect(document.body.textContent).not.toMatch(/Specials/i)
    expect(screen.getByText('Every week: Boxing Tue & Thu')).toBeInTheDocument()
    expect(screen.queryAllByText('Boxing')).toHaveLength(0)
    expect(screen.getByText('Ron staying with us')).toBeInTheDocument()
    expect(screen.getByText('All day · until Nov 15')).toBeInTheDocument()

    // A specials-only day (Wed Nov 4) has no dots; a specials + Boxing day
    // (Thu Nov 5) has none either.
    expect(dots('2026-11-04')).toBe(0)
    expect(dots('2026-11-05')).toBe(0)
    // Election Day is one dot, not specials + Boxing + it.
    expect(dots('2026-11-03')).toBe(1)
    expect(dots('2026-11-07')).toBe(1)
    // Ron's stay dots each of its days.
    expect(['2026-11-13', '2026-11-14', '2026-11-15'].map(dots)).toEqual([1, 1, 1])
    expect(dots('2026-11-16')).toBe(0)
  })

  it('no rhythm line when nothing comes round weekly', () => {
    cal.events = [ev('e', 'Election Day', '2026-11-03', { all_day: true })]
    render(<NextWeeks start={NOV} weeks={5} />)
    expect(screen.queryByText(/^Every week/)).toBeNull()
  })
})
