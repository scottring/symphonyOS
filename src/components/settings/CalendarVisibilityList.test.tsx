import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CalendarVisibilityList } from './CalendarVisibilityList'
import type { GoogleCalendarInfo } from '@/hooks/useGoogleCalendar'

const calendars: GoogleCalendarInfo[] = [
  { id: 'cal-own', summary: 'My Work Calendar', email: '', accessRole: 'owner', primary: true },
  { id: 'cal-ro', summary: 'Holidays in United States', email: '', accessRole: 'reader', primary: false },
]

describe('CalendarVisibilityList', () => {
  it('renders a row per calendar', () => {
    render(<CalendarVisibilityList calendars={calendars} hiddenIds={new Set()} onSetHidden={vi.fn()} />)
    expect(screen.getByText('My Work Calendar')).toBeInTheDocument()
    expect(screen.getByText('Holidays in United States')).toBeInTheDocument()
  })

  it('marks read-only calendars with a badge, not writable ones', () => {
    render(<CalendarVisibilityList calendars={calendars} hiddenIds={new Set()} onSetHidden={vi.fn()} />)
    const roRow = screen.getByText('Holidays in United States').closest('li')!
    expect(within(roRow).getByText(/read-only/i)).toBeInTheDocument()
    const ownRow = screen.getByText('My Work Calendar').closest('li')!
    expect(within(ownRow).queryByText(/read-only/i)).not.toBeInTheDocument()
  })

  it('shows a visible calendar as on and a hidden calendar as off', () => {
    render(<CalendarVisibilityList calendars={calendars} hiddenIds={new Set(['cal-ro'])} onSetHidden={vi.fn()} />)
    expect(screen.getByRole('switch', { name: /My Work Calendar/i })).toBeChecked()
    expect(screen.getByRole('switch', { name: /Holidays in United States/i })).not.toBeChecked()
  })

  it('turns a visible calendar off when toggled', () => {
    const onSetHidden = vi.fn()
    render(<CalendarVisibilityList calendars={calendars} hiddenIds={new Set()} onSetHidden={onSetHidden} />)
    fireEvent.click(screen.getByRole('switch', { name: /My Work Calendar/i }))
    expect(onSetHidden).toHaveBeenCalledWith('cal-own', true)
  })

  it('turns a hidden calendar back on when toggled', () => {
    const onSetHidden = vi.fn()
    render(<CalendarVisibilityList calendars={calendars} hiddenIds={new Set(['cal-ro'])} onSetHidden={onSetHidden} />)
    fireEvent.click(screen.getByRole('switch', { name: /Holidays in United States/i }))
    expect(onSetHidden).toHaveBeenCalledWith('cal-ro', false)
  })
})
