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
    error: null,
    connect: vi.fn(),
    fetchWeekEvents: vi.fn(),
    ...overrides,
  }
}

// Five states, four visible (walkthrough + review 2026-09-20): a new account
// used to open on an empty Today with no hint that events existed, and a
// connected-but-empty day looked identical to a disconnected one.
describe('CalendarReconnectBanner (calendar status)', () => {
  beforeEach(() => { setCalendarState({}) })

  it('renders nothing when the calendar is connected and healthy', () => {
    setCalendarState({ isConnected: true })
    const { container } = render(<CalendarReconnectBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while the connection is still being validated', () => {
    setCalendarState({ needsReconnect: true, isLoading: true })
    const { container } = render(<CalendarReconnectBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says so, quietly, when no calendar is connected — and offers to connect', () => {
    const connect = vi.fn()
    setCalendarState({ isConnected: false, connect })
    render(<CalendarReconnectBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(/No calendar connected/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /connect google calendar/i }))
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('renders the reconnect alert when the token needs reconnecting', () => {
    const connect = vi.fn()
    setCalendarState({ isConnected: true, needsReconnect: true, connect })
    render(<CalendarReconnectBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent(/disconnected/i)
    fireEvent.click(screen.getByRole('button', { name: /reconnect/i }))
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('says a sync failed while connected, and retries — "connected" never means "synced"', () => {
    const fetchWeekEvents = vi.fn()
    setCalendarState({ isConnected: true, error: 'Google returned 503', fetchWeekEvents })
    render(<CalendarReconnectBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent(/didn’t sync — Google returned 503/)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(fetchWeekEvents).toHaveBeenCalledTimes(1)
  })
})
