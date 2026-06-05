import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarReconnectBanner } from './CalendarReconnectBanner'

// Per-file override of the global useGoogleCalendar mock so each test can set
// the connection state it needs. vi.hoisted lets the factory reference a
// mutable holder that tests reassign.
const { state } = vi.hoisted(() => ({
  state: { current: {} as Record<string, unknown> },
}))

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => state.current,
}))

function setCalendarState(overrides: Record<string, unknown>) {
  state.current = {
    isConnected: false,
    needsReconnect: false,
    isLoading: false,
    connect: vi.fn(),
    ...overrides,
  }
}

describe('CalendarReconnectBanner', () => {
  beforeEach(() => {
    setCalendarState({})
  })

  it('renders nothing when the calendar is connected', () => {
    setCalendarState({ isConnected: true, needsReconnect: false })
    const { container } = render(<CalendarReconnectBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while the connection is still being validated', () => {
    // needsReconnect can briefly be false during the startup validation call;
    // even if it were true, isLoading must suppress the banner to avoid a flash.
    setCalendarState({ needsReconnect: true, isLoading: true })
    const { container } = render(<CalendarReconnectBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the reconnect banner when the token needs reconnecting', () => {
    setCalendarState({ needsReconnect: true, isLoading: false })
    render(<CalendarReconnectBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument()
  })

  it('calls connect() when the Reconnect button is clicked', () => {
    const connect = vi.fn()
    setCalendarState({ needsReconnect: true, isLoading: false, connect })
    render(<CalendarReconnectBanner />)
    fireEvent.click(screen.getByRole('button', { name: /reconnect/i }))
    expect(connect).toHaveBeenCalledTimes(1)
  })
})
