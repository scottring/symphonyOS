import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'

const db = vi.hoisted(() => ({
  invokes: [] as unknown[],
  releaseInvoke: [] as Array<() => void>,
  authCb: null as null | ((event: string, session: unknown) => void),
}))

vi.mock('@/lib/supabase', () => ({
  getAuthUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [{ provider: 'google', token_expires_at: null, calendar_id: null }], error: null }) }),
    }),
    functions: {
      invoke: (name: string, opts: unknown) => {
        db.invokes.push({ name, opts })
        return new Promise((resolve) => { db.releaseInvoke.push(() => resolve({ data: { events: [] }, error: null })) })
      },
    },
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        db.authCb = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
  },
}))

// The test setup stands in a fake provider for every other file; this one is about the real one.
vi.unmock('@/hooks/useGoogleCalendar')
import { GoogleCalendarProvider, useGoogleCalendar } from '@/hooks/useGoogleCalendar'

const wrapper = ({ children }: { children: ReactNode }) => <GoogleCalendarProvider>{children}</GoogleCalendarProvider>

describe('calendar connection check — once per load, and not in the page’s way', () => {
  beforeEach(() => { db.invokes = []; db.releaseInvoke = []; db.authCb = null })

  it('is connected as soon as a connection row is read, before the test call answers', async () => {
    const { result } = renderHook(() => useGoogleCalendar(), { wrapper })
    await waitFor(() => expect(result.current.isConnected).toBe(true))
    // The validation call is out but has not answered; the page may read now.
    expect(db.invokes).toHaveLength(1)
    await act(async () => { db.releaseInvoke.forEach((r) => r()) })
  })

  it('the SIGNED_IN that supabase-js sends on every session restore does not check again', async () => {
    const { result } = renderHook(() => useGoogleCalendar(), { wrapper })
    // Page load: the restore announces SIGNED_IN beside the mount check.
    act(() => { db.authCb?.('SIGNED_IN', { user: { id: 'u1' } }) })
    await waitFor(() => expect(result.current.isConnected).toBe(true))
    await waitFor(() => expect(db.invokes).toHaveLength(1))
    await act(async () => { db.releaseInvoke.splice(0).forEach((r) => r()) })

    // A return to the tab: another SIGNED_IN for the same user, just validated.
    await act(async () => { db.authCb?.('SIGNED_IN', { user: { id: 'u1' } }) })
    await act(async () => { await Promise.resolve() })
    expect(db.invokes).toHaveLength(1)
  })

  it('a different user signing in is always checked', async () => {
    renderHook(() => useGoogleCalendar(), { wrapper })
    await waitFor(() => expect(db.invokes).toHaveLength(1))
    await act(async () => { db.releaseInvoke.splice(0).forEach((r) => r()) })
    await act(async () => { db.authCb?.('SIGNED_IN', { user: { id: 'u2' } }) })
    await waitFor(() => expect(db.invokes).toHaveLength(2))
    await act(async () => { db.releaseInvoke.splice(0).forEach((r) => r()) })
  })
})
