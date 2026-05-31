import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { render } from '@/test/test-utils'
import { WeekGrid } from './WeekGrid'

const renderWithDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>)

describe('WeekGrid', () => {
  const weekStart = new Date(2026, 4, 17) // Sun May 17

  it('renders 7 day-column headers with weekday + date', () => {
    renderWithDnd(<WeekGrid weekStart={weekStart} children={null} />)
    expect(screen.getByText(/SUN/i)).toBeInTheDocument()
    expect(screen.getByText(/SAT/i)).toBeInTheDocument()
    expect(screen.getByText(/17/)).toBeInTheDocument()
    expect(screen.getByText(/23/)).toBeInTheDocument()
  })

  it('renders hour labels from 8 AM to 9 PM', () => {
    renderWithDnd(<WeekGrid weekStart={weekStart} children={null} />)
    expect(screen.getByText(/8 AM/)).toBeInTheDocument()
    expect(screen.getByText(/9 PM/)).toBeInTheDocument()
  })

  it('renders 13 hour rows total', () => {
    const { container } = renderWithDnd(<WeekGrid weekStart={weekStart} children={null} />)
    const hourLabels = container.querySelectorAll('[data-hour-label]')
    expect(hourLabels).toHaveLength(13)
  })

  it('exposes an all-day events row labeled "all-day"', () => {
    renderWithDnd(<WeekGrid weekStart={weekStart} children={null} />)
    expect(screen.getByText(/all-day/i)).toBeInTheDocument()
  })

  it('renders provided children (positioned event blocks)', () => {
    renderWithDnd(
      <WeekGrid weekStart={weekStart}>
        <div data-testid="positioned-block">block</div>
      </WeekGrid>,
    )
    expect(screen.getByTestId('positioned-block')).toBeInTheDocument()
  })

  it('renders renderAllDay content into each day of the all-day row', () => {
    renderWithDnd(
      <WeekGrid
        weekStart={weekStart}
        children={null}
        renderAllDay={(day) => <span>chip-{day.getDate()}</span>}
      />,
    )
    expect(screen.getByText('chip-17')).toBeInTheDocument() // Sun May 17
    expect(screen.getByText('chip-23')).toBeInTheDocument() // Sat May 23
  })

  it('renders 5 day-column headers when dayCount=5', () => {
    // 2026-05-18 is a Monday
    const monday = new Date(2026, 4, 18)
    renderWithDnd(<WeekGrid weekStart={monday} dayCount={5} />)
    const headerCells = screen.getAllByText(/^(mon|tue|wed|thu|fri|sat|sun)$/i)
    expect(headerCells).toHaveLength(5)
  })

  it('defaults to 7 day columns when dayCount is omitted', () => {
    // 2026-05-17 is a Sunday
    const sunday = new Date(2026, 4, 17)
    renderWithDnd(<WeekGrid weekStart={sunday} />)
    const headerCells = screen.getAllByText(/^(mon|tue|wed|thu|fri|sat|sun)$/i)
    expect(headerCells).toHaveLength(7)
  })
})
