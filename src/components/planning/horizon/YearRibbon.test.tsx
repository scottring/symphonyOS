// src/components/planning/horizon/YearRibbon.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YearRibbon } from './YearRibbon'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const NOW = new Date(2026, 6, 25)

const events = [
  { id: 'e1', title: 'Catskills trip', start_time: '2026-08-08T12:00:00Z', end_time: '2026-08-15T12:00:00Z', all_day: true },
] as unknown as CalendarEvent[]

const tasks = [
  { id: 't1', title: 'Ride', completed: false, scheduledFor: new Date(2026, 0, 5) },
] as unknown as Task[]

describe('YearRibbon', () => {
  it('labels all twelve months and names the seasons', () => {
    render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    expect(screen.getByText('JAN')).toBeInTheDocument()
    expect(screen.getByText('DEC')).toBeInTheDocument()
    expect(screen.getByText('Summer')).toBeInTheDocument()
  })

  it('plots a multi-day claim by name', () => {
    render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    expect(screen.getByText(/Catskills/)).toBeInTheDocument()
  })

  it('shades elapsed time up to today', () => {
    const { container } = render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    const shade = container.querySelector('[data-testid="elapsed-shade"]') as HTMLElement
    expect(shade).toBeTruthy()
    expect(parseFloat(shade.style.width)).toBeCloseTo(56.2, 0)
  })

  it('renders one density bar per week of the year', () => {
    const { container } = render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    expect(container.querySelectorAll('[data-testid="density-bar"]').length).toBeGreaterThanOrEqual(52)
  })

  it('says where the written year stops', () => {
    render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    expect(screen.getByText(/runway/)).toBeInTheDocument()
  })

  it('places nothing — the year rung is read-only', () => {
    const { container } = render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
