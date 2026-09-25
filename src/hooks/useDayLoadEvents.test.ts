import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// The global setup mock covers `from`, not `functions` — this hook only ever
// calls the edge function, so stand that in directly.
const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import {
  useDayLoadEvents, DAY_LOAD_RANGE_DAYS, DAY_LOAD_BACK_DAYS, DAY_LOAD_RETRY_AFTER_MS,
  dayLoadWindow, __resetDayLoadCache,
} from './useDayLoadEvents'
import { setCurrentAccount, __resetCurrentAccount } from '@/lib/currentAccount'
import { emitCalendarChanged } from '@/lib/calendarChangedSignal'

const ok = (events: unknown[] = [{ id: 'e1', title: 'Standup' }]) =>
  invoke.mockResolvedValue({ data: { events }, error: null })
const fails = () => invoke.mockResolvedValue({ data: null, error: new Error('boom') })

describe('useDayLoadEvents', () => {
  beforeEach(() => {
    __resetDayLoadCache()
    __resetCurrentAccount()
    invoke.mockReset()
  })

  it('fetches nothing until enabled', () => {
    renderHook(() => useDayLoadEvents(false))
    expect(invoke).not.toHaveBeenCalled()
  })

  it(`fetches ${DAY_LOAD_BACK_DAYS} days back and ${DAY_LOAD_RANGE_DAYS} forward when enabled`, async () => {
    ok()
    const { result } = renderHook(() => useDayLoadEvents(true))

    await waitFor(() => expect(result.current.available).toBe(true))
    expect(result.current.events).toHaveLength(1)

    const body = (invoke.mock.calls[0][1] as { body: { startDate: string; endDate: string } }).body
    const days = Math.round(
      (new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) / 86_400_000,
    )
    // Back far enough to cover the week containing today — the day tiles
    // offer a whole week, and on a Thursday four of its days are already past.
    expect(days).toBe(DAY_LOAD_RANGE_DAYS + DAY_LOAD_BACK_DAYS)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const startsBack = Math.round((today.getTime() - new Date(body.startDate).getTime()) / 86_400_000)
    expect(startsBack).toBe(DAY_LOAD_BACK_DAYS)
  })

  it('returns the range it actually read, not a range derived from the clock', async () => {
    ok()
    const { result } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.available).toBe(true))
    const body = (invoke.mock.calls[0][1] as { body: { startDate: string; endDate: string } }).body
    expect(result.current.range).toEqual({
      start: new Date(body.startDate).getTime(),
      end: new Date(body.endDate).getTime(),
    })
  })

  it('fetches once, not on every re-render', async () => {
    ok([])
    const { result, rerender } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.available).toBe(true))
    rerender()
    rerender()
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('reports unavailable on failure instead of pretending the days are empty', async () => {
    fails()
    const { result } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.available).toBe(false)
    expect(result.current.events).toEqual([])
    expect(result.current.range).toBeNull()
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

// Everything below is what Codex's review of d774bccc found missing: the cache
// was global, woke only whoever started the read, latched failure for the life
// of the tab, and had no key for the account or the day.
describe('the shared read, with more than one reader', () => {
  beforeEach(() => {
    __resetDayLoadCache(); __resetCurrentAccount(); invoke.mockReset()
  })

  it('reads ONCE for two consumers, and wakes them both', async () => {
    let resolve!: (v: unknown) => void
    invoke.mockImplementation(() => new Promise((r) => { resolve = r }))
    const a = renderHook(() => useDayLoadEvents(true))
    const b = renderHook(() => useDayLoadEvents(true))
    expect(invoke).toHaveBeenCalledOnce()
    expect(a.result.current.loading).toBe(true)
    expect(b.result.current.loading).toBe(true)

    await act(async () => { resolve({ data: { events: [{ id: 'e1' }] }, error: null }) })
    // The second consumer never started a request and, before this, was never
    // told one had finished.
    expect(b.result.current.available).toBe(true)
    expect(b.result.current.events).toHaveLength(1)
    expect(a.result.current.available).toBe(true)
  })

  it('still lands, and still wakes the others, when the consumer that started it unmounts', async () => {
    let resolve!: (v: unknown) => void
    invoke.mockImplementation(() => new Promise((r) => { resolve = r }))
    const starter = renderHook(() => useDayLoadEvents(true))
    const other = renderHook(() => useDayLoadEvents(true))
    // An open menu is closed long before a slow calendar answers.
    starter.unmount()

    await act(async () => { resolve({ data: { events: [{ id: 'e1' }] }, error: null }) })
    expect(other.result.current.available).toBe(true)
    expect(other.result.current.events).toHaveLength(1)
  })

  it('does not start a second read while one is in flight', async () => {
    let resolve!: (v: unknown) => void
    invoke.mockImplementation(() => new Promise((r) => { resolve = r }))
    renderHook(() => useDayLoadEvents(true))
    renderHook(() => useDayLoadEvents(true))
    renderHook(() => useDayLoadEvents(true))
    expect(invoke).toHaveBeenCalledOnce()
    await act(async () => { resolve({ data: { events: [] }, error: null }) })
  })
})

describe('recovering from a failed read', () => {
  beforeEach(() => {
    __resetDayLoadCache(); __resetCurrentAccount(); invoke.mockReset()
  })
  afterEach(() => { vi.useRealTimers() })

  it('does not hammer the backend: a fresh consumer inside the cooldown does not retry', async () => {
    fails()
    const first = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(first.result.current.failed).toBe(true))
    renderHook(() => useDayLoadEvents(true))
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('tries again once the cooldown has passed — the failure is not latched for the tab', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const t0 = new Date(2026, 9, 7, 9, 0)
    vi.setSystemTime(t0)
    fails()
    const first = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(first.result.current.failed).toBe(true))

    vi.setSystemTime(new Date(t0.getTime() + DAY_LOAD_RETRY_AFTER_MS + 1000))
    ok()
    const second = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(second.result.current.available).toBe(true))
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('a calendar write in this tab retries immediately', async () => {
    fails()
    const { result } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.failed).toBe(true))

    ok()
    await act(async () => { emitCalendarChanged() })
    await waitFor(() => expect(result.current.available).toBe(true))
  })
})

describe('a calendar we changed ourselves', () => {
  beforeEach(() => { __resetDayLoadCache(); __resetCurrentAccount(); invoke.mockReset() })

  it('re-reads after a write, so the day tiles stop reporting the old count', async () => {
    ok([{ id: 'e1' }])
    const { result } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.events).toHaveLength(1))

    ok([{ id: 'e1' }, { id: 'e2' }])
    await act(async () => { emitCalendarChanged() })
    await waitFor(() => expect(result.current.events).toHaveLength(2))
  })

  it('ignores the signal when it is not enabled — nothing polls', async () => {
    renderHook(() => useDayLoadEvents(false))
    await act(async () => { emitCalendarChanged() })
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('two accounts in one tab', () => {
  beforeEach(() => { __resetDayLoadCache(); __resetCurrentAccount(); invoke.mockReset() })

  it('never shows the first account’s calendar to the second', async () => {
    setCurrentAccount('user-a')
    ok([{ id: 'a-only' }])
    const { result, rerender } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(result.current.events).toEqual([{ id: 'a-only' }])

    // Somebody else signs in.
    ok([{ id: 'b-only' }])
    await act(async () => { setCurrentAccount('user-b') })
    rerender()
    await waitFor(() => expect(result.current.events).toEqual([{ id: 'b-only' }]))
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('keys the read by account, so the two windows are different reads', () => {
    expect(dayLoadWindow('user-a').key).not.toBe(dayLoadWindow('user-b').key)
    expect(dayLoadWindow(null).key).toContain('anon')
  })
})

describe('a tab left open overnight', () => {
  beforeEach(() => { __resetDayLoadCache(); __resetCurrentAccount(); invoke.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('the window key changes with the day, so yesterday’s read stops matching', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59))
    const before = dayLoadWindow('u1')
    vi.setSystemTime(new Date(2026, 9, 8, 0, 1))
    const after = dayLoadWindow('u1')
    expect(after.key).not.toBe(before.key)
    expect(after.range.start).toBeGreaterThan(before.range.start)
  })

  it('re-reads for the new day rather than reporting yesterday’s coverage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59))
    ok([{ id: 'yesterday' }])
    const { result, rerender } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.available).toBe(true))
    const firstRange = result.current.range!

    vi.setSystemTime(new Date(2026, 9, 8, 0, 1))
    ok([{ id: 'today' }])
    rerender()
    await waitFor(() => expect(result.current.events).toEqual([{ id: 'today' }]))
    expect(result.current.range!.start).toBeGreaterThan(firstRange.start)
  })
})

// Codex's addendum to the review of 90e417a2: forced reads bypassed the
// in-flight dedupe, and every enabled consumer subscribed to the signals for
// itself. One write with three pickers open started three reads, and whichever
// answered last won — which is not the same as whichever was newest.
describe('one signal, however many consumers', () => {
  beforeEach(() => { __resetDayLoadCache(); __resetCurrentAccount(); invoke.mockReset() })

  it('a calendar write starts ONE read, not one per consumer', async () => {
    ok([{ id: 'before' }])
    const a = renderHook(() => useDayLoadEvents(true))
    const b = renderHook(() => useDayLoadEvents(true))
    const c = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(a.result.current.available).toBe(true))
    expect(invoke).toHaveBeenCalledOnce()

    ok([{ id: 'after' }])
    await act(async () => { emitCalendarChanged() })
    await waitFor(() => expect(a.result.current.events).toEqual([{ id: 'after' }]))
    // Two in total: the first mount, and one for the write.
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(b.result.current.events).toEqual([{ id: 'after' }])
    expect(c.result.current.events).toEqual([{ id: 'after' }])
  })

  it('unwires when the last consumer goes, and wires again for the next', async () => {
    ok([])
    const only = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(only.result.current.available).toBe(true))
    only.unmount()

    // Nothing is listening: a signal with no consumers starts nothing.
    invoke.mockClear()
    await act(async () => { emitCalendarChanged() })
    expect(invoke).not.toHaveBeenCalled()

    // …and the next consumer picks the wiring back up.
    ok([{ id: 'fresh' }])
    const next = renderHook(() => useDayLoadEvents(true))
    await act(async () => { emitCalendarChanged() })
    await waitFor(() => expect(next.result.current.events).toEqual([{ id: 'fresh' }]))
  })
})

describe('responses arriving out of order', () => {
  beforeEach(() => { __resetDayLoadCache(); __resetCurrentAccount(); invoke.mockReset() })

  it('an older response never overwrites a newer one', async () => {
    const pending: Array<(v: unknown) => void> = []
    invoke.mockImplementation(() => new Promise((r) => { pending.push(r) }))

    const { result } = renderHook(() => useDayLoadEvents(true))
    expect(pending).toHaveLength(1)                      // the mount read

    // A different account signs in: the old read is orphaned and a new one
    // starts for the new account.
    await act(async () => { setCurrentAccount('user-b') })
    expect(pending).toHaveLength(2)

    // The NEW read answers first…
    await act(async () => { pending[1]({ data: { events: [{ id: 'new' }] }, error: null }) })
    expect(result.current.events).toEqual([{ id: 'new' }])

    // …and the OLD one answers late. It must change nothing.
    await act(async () => { pending[0]({ data: { events: [{ id: 'old' }] }, error: null }) })
    expect(result.current.events).toEqual([{ id: 'new' }])
  })

  it('a late FAILURE from an orphaned read does not mark the current one failed', async () => {
    const pending: Array<(v: unknown) => void> = []
    invoke.mockImplementation(() => new Promise((r) => { pending.push(r) }))
    const { result } = renderHook(() => useDayLoadEvents(true))
    await act(async () => { setCurrentAccount('user-b') })
    await act(async () => { pending[1]({ data: { events: [{ id: 'new' }] }, error: null }) })
    await act(async () => { pending[0]({ data: null, error: new Error('late boom') }) })
    expect(result.current.failed).toBe(false)
    expect(result.current.available).toBe(true)
  })
})

describe('a mutation that arrives mid-request', () => {
  beforeEach(() => { __resetDayLoadCache(); __resetCurrentAccount(); invoke.mockReset() })

  it('is not discarded: the in-flight read lands, then a fresh one follows', async () => {
    const pending: Array<(v: unknown) => void> = []
    invoke.mockImplementation(() => new Promise((r) => { pending.push(r) }))
    const { result } = renderHook(() => useDayLoadEvents(true))
    expect(pending).toHaveLength(1)

    // The write happens while the first read is still in the air. That read
    // describes the world BEFORE the write, so it cannot be the final answer.
    await act(async () => { emitCalendarChanged() })
    expect(pending).toHaveLength(1)                       // deduped, not a second parallel call

    await act(async () => { pending[0]({ data: { events: [{ id: 'stale' }] }, error: null }) })
    // Its completion starts the re-read rather than leaving the stale count.
    expect(pending).toHaveLength(2)

    await act(async () => { pending[1]({ data: { events: [{ id: 'current' }] }, error: null }) })
    expect(result.current.events).toEqual([{ id: 'current' }])
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('several writes during one request still produce exactly one re-read', async () => {
    const pending: Array<(v: unknown) => void> = []
    invoke.mockImplementation(() => new Promise((r) => { pending.push(r) }))
    renderHook(() => useDayLoadEvents(true))
    renderHook(() => useDayLoadEvents(true))

    await act(async () => { emitCalendarChanged(); emitCalendarChanged(); emitCalendarChanged() })
    expect(pending).toHaveLength(1)
    await act(async () => { pending[0]({ data: { events: [] }, error: null }) })
    expect(pending).toHaveLength(2)
    await act(async () => { pending[1]({ data: { events: [] }, error: null }) })
    expect(pending).toHaveLength(2)                       // and no more
  })
})

describe('the failure cooldown and forced reads', () => {
  beforeEach(() => { __resetDayLoadCache(); __resetCurrentAccount(); invoke.mockReset() })

  it('a write retries immediately even inside the cooldown — it is not polling', async () => {
    fails()
    const { result } = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(invoke).toHaveBeenCalledOnce()

    ok([{ id: 'recovered' }])
    await act(async () => { emitCalendarChanged() })
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('but a mounting consumer inside the cooldown still does not', async () => {
    fails()
    const first = renderHook(() => useDayLoadEvents(true))
    await waitFor(() => expect(first.result.current.failed).toBe(true))
    renderHook(() => useDayLoadEvents(true))
    renderHook(() => useDayLoadEvents(true))
    expect(invoke).toHaveBeenCalledOnce()
  })
})
