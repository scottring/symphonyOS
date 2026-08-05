import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// The global setup mock covers `from`, not `functions` — this hook only ever
// calls the edge function, so stand that in directly.
const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import { useDayLoadEvents, DAY_LOAD_RANGE_DAYS, __resetDayLoadCache } from './useDayLoadEvents'

describe('useDayLoadEvents', () => {
  beforeEach(() => {
    __resetDayLoadCache()
    invoke.mockReset()
  })

  it('fetches nothing until enabled', () => {
    renderHook(() => useDayLoadEvents(false))
    expect(invoke).not.toHaveBeenCalled()
  })

  it(`fetches a ${DAY_LOAD_RANGE_DAYS}-day range when enabled`, async () => {
    invoke.mockResolvedValue({ data: { events: [{ id: 'e1', title: 'Standup' }] }, error: null })
    const { result } = renderHook(() => useDayLoadEvents(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toHaveLength(1)
    expect(result.current.available).toBe(true)

    const body = (invoke.mock.calls[0][1] as { body: { startDate: string; endDate: string } }).body
    const days = Math.round(
      (new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) / 86_400_000,
    )
    expect(days).toBe(DAY_LOAD_RANGE_DAYS)
  })

  it('fetches once, not on every re-render', async () => {
    invoke.mockResolvedValue({ data: { events: [] }, error: null })
    const { result, rerender } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender()
    rerender()
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('reports unavailable on failure instead of pretending the days are empty', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    const { result } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.available).toBe(false)
    expect(result.current.events).toEqual([])
  })

  it('never touches the shared calendar provider', async () => {
    // Guard against a future edit reaching for GoogleCalendarProvider: doing so
    // would blank the events in the view behind the open panel.
    const raw = await import('fs').then((fs) =>
      fs.readFileSync('src/hooks/useDayLoadEvents.ts', 'utf8'),
    )
    // Strip comments — the doc comment names both of these while explaining why
    // the hook must not call them.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/useGoogleCalendar\s*\(/)
    expect(code).not.toMatch(/setEvents/)
  })
})
