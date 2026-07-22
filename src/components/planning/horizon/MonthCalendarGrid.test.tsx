// src/components/planning/horizon/MonthCalendarGrid.test.tsx
//
// The month grid's week-start ordering must follow the cadence config
// (`weekStartsOn`), never a hardcoded Sunday-first layout. See
// src/lib/cadence/config.ts orderedWeekDays/orderedDayKeys — the single
// source of ordering for the app.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthCalendarGrid } from './MonthCalendarGrid'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const tasks: Task[] = []
const events: CalendarEvent[] = []

function firstCellDay(container: HTMLElement): string | null {
  // Day cells render their date in a trailing `<span>`; the day-number grid
  // is the second `grid-cols-7` block (the first is the weekday header row).
  const dayGrids = container.querySelectorAll('.grid.grid-cols-7')
  const dayGrid = dayGrids[1]
  const firstCell = dayGrid?.querySelector('span')
  return firstCell?.textContent ?? null
}

describe('MonthCalendarGrid week-start ordering', () => {
  it('defaults to Sunday-first (weekStartsOn 0): current behavior preserved', () => {
    const { container } = render(<MonthCalendarGrid month={new Date(2026, 6, 1)} tasks={tasks} events={events} weekStartsOn={0} />)
    const headers = screen.getAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)
    expect(headers[0]).toHaveTextContent('Sun')
    // First cell of the grid is Sun Jun 28 2026.
    expect(firstCellDay(container)).toBe('28')
  })

  it('honors weekStartsOn 1 (Monday-first): header and first cell shift', () => {
    const { container } = render(<MonthCalendarGrid month={new Date(2026, 6, 1)} tasks={tasks} events={events} weekStartsOn={1} />)
    const headers = screen.getAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)
    expect(headers[0]).toHaveTextContent('Mon')
    // First cell of the grid is Mon Jun 29 2026.
    expect(firstCellDay(container)).toBe('29')
  })
})
