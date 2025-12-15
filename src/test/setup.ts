import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Mock CopilotKit and related CSS to avoid katex CSS import issues from node_modules
vi.mock('@copilotkit/react-ui', () => ({
  CopilotSidebar: ({ children }: { children: React.ReactNode }) => children,
  CopilotPopup: ({ children }: { children: React.ReactNode }) => children,
  CopilotChat: () => null,
  useCopilotChat: () => ({
    appendMessage: vi.fn(),
    setMessages: vi.fn(),
    messages: [],
    isLoading: false,
  }),
}))
vi.mock('@copilotkit/react-ui/styles.css', () => ({}))

// Mock the local copilot components to prevent the chain of imports
vi.mock('@/components/chat/copilot', () => ({
  CopilotProvider: ({ children }: { children: React.ReactNode }) => children,
  CopilotChat: () => null,
}))

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
