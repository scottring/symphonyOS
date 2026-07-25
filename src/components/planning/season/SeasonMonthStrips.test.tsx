// src/components/planning/season/SeasonMonthStrips.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeasonMonthStrips } from './SeasonMonthStrips'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Task } from '@/types/task'

const SUMMER = new Date(2026, 6, 1)
const NOW = new Date(2026, 6, 25)

const events = [
  { id: 'e1', title: 'Catskills trip', start_time: '2026-08-08T12:00:00Z', end_time: '2026-08-15T12:00:00Z', all_day: true },
] as unknown as CalendarEvent[]

describe('SeasonMonthStrips', () => {
  it('names the season’s three months', () => {
    render(<SeasonMonthStrips seasonStart={SUMMER} tasks={[]} events={events} now={NOW} />)
    expect(screen.getByText('July')).toBeInTheDocument()
    expect(screen.getByText('August')).toBeInTheDocument()
    expect(screen.getByText('September')).toBeInTheDocument()
  })

  it('chips a multi-day claim into the month it falls in', () => {
    render(<SeasonMonthStrips seasonStart={SUMMER} tasks={[]} events={events} now={NOW} />)
    expect(screen.getByTestId('strip-7')).toHaveTextContent(/Catskills/)
    expect(screen.getByTestId('strip-6')).not.toHaveTextContent(/Catskills/)
  })

  it('marks a nearly empty month wide open', () => {
    render(<SeasonMonthStrips seasonStart={SUMMER} tasks={[]} events={events} now={NOW} />)
    expect(screen.getByTestId('strip-8')).toHaveTextContent(/wide open/i)
  })

  it('shades elapsed season time', () => {
    render(<SeasonMonthStrips seasonStart={SUMMER} tasks={[]} events={events} now={NOW} />)
    const shade = screen.getByTestId('season-elapsed-shade')
    expect(parseFloat(shade.style.width)).toBeGreaterThan(20)
    expect(parseFloat(shade.style.width)).toBeLessThan(35)
  })

  it('counts the current month’s undated pool as its moves', () => {
    const tasks = [
      { id: 'm1', title: 'fix up the porch', bucket: 'month', completed: false },
    ] as unknown as Task[]
    render(<SeasonMonthStrips seasonStart={SUMMER} tasks={tasks} events={events} now={NOW} />)
    expect(screen.getByTestId('strip-6')).toHaveTextContent('1 move')
  })

  it('opens a month when given a handler', async () => {
    const onOpenMonth = vi.fn()
    render(<SeasonMonthStrips seasonStart={SUMMER} tasks={[]} events={events} now={NOW} onOpenMonth={onOpenMonth} />)
    await userEvent.click(screen.getByTestId('strip-7'))
    expect(onOpenMonth).toHaveBeenCalled()
  })
})
