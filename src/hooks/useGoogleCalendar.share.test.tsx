import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'

const db = vi.hoisted(() => ({ reads: [] as Array<{ startDate: string; endDate: string }> }))

vi.mock('@/lib/supabase', () => ({
  getAuthUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [{ id: 'g1', provider: 'google', token_expires_at: null, calendar_id: null }], error: null }) }),
    }),
    functions: {
      invoke: async (_name: string, opts: { body: { startDate: string; endDate: string } }) => {
        db.reads.push(opts.body)
        return { data: { events: [{ id: `e${db.reads.length}` }] }, error: null }
      },
    },
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
  },
}))

vi.unmock('@/hooks/useGoogleCalendar')
import { GoogleCalendarProvider, useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { __resetRecentEvents } from '@/hooks/recentCalendarEvents'
import { emitCalendarChanged } from '@/lib/calendarChangedSignal'
import { dayEventSpan } from '@/lib/weekHelpers'
import { __resetSharedRequests } from '@/lib/sharedRequest'
import { afterPageData } from '@/lib/loadPriority'

const wrapper = ({ children }: { children: ReactNode }) => <GoogleCalendarProvider>{children}</GoogleCalendarProvider>
const day = dayEventSpan(new Date(2026, 9, 18, 15, 30))
/** Reads of the day window, not the connection check. */
const dayReads = () => db.reads.filter((b) => b.startDate === day.start.toISOString() && b.endDate === day.end.toISOString())

async function connected() {
  const hook = renderHook(() => useGoogleCalendar(), { wrapper })
  await waitFor(() => expect(hook.result.current.isConnected).toBe(true))
  await act(async () => { await afterPageData().catch(() => undefined) })
  return hook
}

describe('dayEventSpan — the one window Home and Today both ask for', () => {
  it('runs from midnight to the next midnight, whatever the hour', () => {
    expect(day.start).toEqual(new Date(2026, 9, 18))
    expect(day.end).toEqual(new Date(2026, 9, 19))
  })

  it('a 25-hour day (DST ends) still ends at the next midnight', () => {
    const { start, end } = dayEventSpan(new Date(2026, 10, 1, 12))
    expect(end).toEqual(new Date(2026, 10, 2))
    expect(start).toEqual(new Date(2026, 10, 1))
  })
})

describe('fetchEvents shares a read of the same window for a moment', () => {
  beforeEach(() => { db.reads = []; __resetRecentEvents(); __resetSharedRequests() })
  afterEach(() => { vi.restoreAllMocks() })

  it('Home then Today: one read of the day, and both get its events', async () => {
    const { result } = await connected()
    let home: unknown[] = [], today: unknown[] = []
    await act(async () => { home = await result.current.fetchEvents(day.start, day.end) })
    await act(async () => { today = await result.current.fetchEvents(day.start, day.end) })
    expect(dayReads()).toHaveLength(1)
    expect(today).toEqual(home)
    expect(result.current.events).toEqual(home)
  })

  it('two asks at once share the request in the air', async () => {
    const { result } = await connected()
    await act(async () => {
      await Promise.all([result.current.fetchEvents(day.start, day.end), result.current.fetchEvents(day.start, day.end)])
    })
    expect(dayReads()).toHaveLength(1)
  })

  it('a calendar write in this tab drops what was held, so the next ask reads again', async () => {
    const { result } = await connected()
    await act(async () => { await result.current.fetchEvents(day.start, day.end) })
    act(() => { emitCalendarChanged() })
    await act(async () => { await result.current.fetchEvents(day.start, day.end) })
    expect(dayReads()).toHaveLength(2)
  })

  it('after thirty seconds the same window is read again', async () => {
    const { result } = await connected()
    const now = Date.now()
    await act(async () => { await result.current.fetchEvents(day.start, day.end) })
    vi.spyOn(Date, 'now').mockReturnValue(now + 31_000)
    await act(async () => { await result.current.fetchEvents(day.start, day.end) })
    expect(dayReads()).toHaveLength(2)
  })
})
