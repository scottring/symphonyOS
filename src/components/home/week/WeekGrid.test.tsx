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
})
