import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Global mock for GoogleCalendarProvider - makes the provider a passthrough
// Individual tests can override with vi.mock if needed
vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({
    isConnected: false,
    needsReconnect: false,
    isLoading: false,
    isFetching: false,
    events: [],
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    fetchTodayEvents: vi.fn(),
    fetchWeekEvents: vi.fn(),
    fetchEvents: vi.fn(),
    createEvent: vi.fn(),
  }),
  GoogleCalendarProvider: ({ children }: { children: React.ReactNode }) => children,
  CalendarReconnectError: class CalendarReconnectError extends Error {
    constructor(message = 'Calendar connection expired. Please reconnect.') {
      super(message)
      this.name = 'CalendarReconnectError'
    }
  },
}))

// Mock window.matchMedia for mobile detection hook
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, // Default to desktop view in tests
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Cleanup after each test
afterEach(() => {
  cleanup()
})
