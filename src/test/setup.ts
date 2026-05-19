import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Global mock for Supabase client - provides chainable query methods
// Individual tests can override with more specific mocks if needed
vi.mock('@/lib/supabase', () => {
  // Helper to create chainable query builder that supports common patterns
  const createChainableQuery = (data: any[] = [], error: any = null) => {
    const chain = {
      eq: () => chain,
      or: () => chain,
      order: () => chain, // Return chain to support multiple .order() calls
      select: () => chain,
      single: () => Promise.resolve({ data: data[0] || null, error }),
    }
    // Make it thenable for direct awaiting
    return Object.assign(Promise.resolve({ data, error }), chain)
  }

  return {
    supabase: {
      from: () => ({
        select: () => createChainableQuery(),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      channel: () => ({
        on: () => ({ subscribe: vi.fn() }),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }),
    },
  }
})

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
    updateEvent: vi.fn(),
    moveEvent: vi.fn(),
    deleteEvent: vi.fn(),
    removeEventLocal: vi.fn(),
    restoreEventLocal: vi.fn(),
    fetchCalendarList: vi.fn(),
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
