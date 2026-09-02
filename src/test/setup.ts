import '@testing-library/jest-dom'
import React from 'react'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Global mock for Supabase client - provides chainable query methods
// Individual tests can override with more specific mocks if needed
vi.mock('@/lib/supabase', () => {
  // Helper to create chainable query builder that supports common patterns
  const createChainableQuery = (data: any[] = [], error: any = null) => {
    const chain: any = {
      eq: () => chain,
      or: () => chain,
      // `.is('col', null)` — the unreviewed-captures census filters on a NULL
      // column, and a chain missing this link throws inside an effect, which
      // surfaces as an unhandled rejection in whichever unrelated test file
      // happened to mount Today.
      is: () => chain,
      in: () => chain,
      not: () => chain,
      order: () => chain, // Return chain to support multiple .order() calls
      limit: () => chain,
      select: () => chain,
      single: () => Promise.resolve({ data: data[0] || null, error }),
      // Intermediate chains are awaitable too (e.g. .eq().order().limit())
      then: (resolve: (v: { data: any[]; error: any }) => void) => resolve({ data, error }),
    }
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
          in: () => Promise.resolve({ error: null }),
        }),
        delete: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      channel: () => ({
        on: () => ({ subscribe: vi.fn() }),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }),
    },
    // Same shape as the real getAuthUser (src/lib/supabase.ts) — a cached-user
    // read, not a network call. Defaults to no user, same as auth.getUser()
    // above, so hooks that call this (e.g. useNeededListItems, now reached by
    // every TodayView render via NeededTodayNote) short-circuit instead of
    // throwing "no export defined on the mock". Tests that need a real user
    // (useNeededListItems.test.ts, useRoutines.test.ts, ...) already override
    // this whole module locally with their own vi.mock, which wins over this
    // setup-level default.
    getAuthUser: () => Promise.resolve({ data: { user: null }, error: null }),
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
    // Returns Promise<GoogleCalendarInfo[]> for real; a bare vi.fn() hands back
    // undefined and every caller that awaits it throws on `.then`.
    fetchCalendarList: vi.fn().mockResolvedValue([]),
    defaultCalendarId: null,
    setDefaultCalendarId: vi.fn(),
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

// The rich-text editor is a lazily-imported ProseMirror instance. Panels now
// mount it directly (PanelNotes is always live — there is no click-to-edit
// mode), so without this every panel test asserting note text would either race
// the lazy chunk or end up asserting ProseMirror's internals. Stand in with a
// plain element that renders the same content and placeholder.
vi.mock('@/components/notes/TiptapEditor', () => ({
  TiptapEditor: ({ content, placeholder }: { content?: string; placeholder?: string }) => {
    const text = (content ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return React.createElement(
      'div',
      { 'data-testid': 'tiptap-editor' },
      text || placeholder || '',
    )
  },
}))

// Cleanup after each test
afterEach(() => {
  cleanup()
})
