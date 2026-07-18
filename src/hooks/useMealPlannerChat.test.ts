import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { parseSseEvents, useMealPlannerChat } from './useMealPlannerChat'

// ── parseSseEvents (pure helper) ────────────────────────────────────────

describe('parseSseEvents', () => {
  it('parses a single complete frame', () => {
    const { events, rest } = parseSseEvents('data: {"type":"text","text":"hi"}\n\n', '')
    expect(events).toEqual([{ type: 'text', text: 'hi' }])
    expect(rest).toBe('')
  })

  it('splits data frames across chunk boundaries', () => {
    // First chunk ends mid-frame — nothing should parse yet, remainder carried forward.
    const first = parseSseEvents('data: {"type":"text","te', '')
    expect(first.events).toEqual([])
    expect(first.rest).toBe('data: {"type":"text","te')

    // Second chunk completes the frame.
    const second = parseSseEvents('xt":"hello"}\n\n', first.rest)
    expect(second.events).toEqual([{ type: 'text', text: 'hello' }])
    expect(second.rest).toBe('')
  })

  it('parses multiple frames delivered in one chunk', () => {
    const { events, rest } = parseSseEvents(
      'data: {"type":"tool","name":"set_slot"}\n\ndata: {"type":"done","reply":"Set it."}\n\n',
      '',
    )
    expect(events).toEqual([
      { type: 'tool', name: 'set_slot' },
      { type: 'done', reply: 'Set it.' },
    ])
    expect(rest).toBe('')
  })

  it('ignores non-data lines and blank frames', () => {
    const { events, rest } = parseSseEvents(': keep-alive\n\ndata: {"type":"text","text":"ok"}\n\n', '')
    expect(events).toEqual([{ type: 'text', text: 'ok' }])
    expect(rest).toBe('')
  })

  it('skips a malformed frame instead of throwing', () => {
    const { events } = parseSseEvents('data: {not json}\n\ndata: {"type":"text","text":"ok"}\n\n', '')
    expect(events).toEqual([{ type: 'text', text: 'ok' }])
  })

  it('returns an incomplete trailing frame as the remainder', () => {
    const { events, rest } = parseSseEvents(
      'data: {"type":"text","text":"ok"}\n\ndata: {"type":"tool"',
      '',
    )
    expect(events).toEqual([{ type: 'text', text: 'ok' }])
    expect(rest).toBe('data: {"type":"tool"')
  })
})

// ── useMealPlannerChat (hook) ───────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { access_token: 'tok-123' } }, error: null }),
      ),
    },
  },
}))

import { supabase } from '@/lib/supabase'

function frame(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

/** A hand-rolled fetch Response stand-in whose reader chunks are pushed on
 *  demand. Avoids depending on happy-dom's real ReadableStream/Response
 *  wiring — the code under test only ever calls `.ok`, `.body.getReader()`,
 *  and `.text()`, so this satisfies the contract without needing a stream
 *  to fully close before the first chunk is observable (a real Response in
 *  this test environment buffers the whole body before yielding anything,
 *  which makes it useless for asserting mid-stream state). */
function makeControllableResponse() {
  const encoder = new TextEncoder()
  type ReadResult = { done: boolean; value?: Uint8Array }
  const queue: ReadResult[] = []
  let waiting: ((r: ReadResult) => void) | null = null

  function deliver(result: ReadResult) {
    if (waiting) {
      const resolve = waiting
      waiting = null
      resolve(result)
    } else {
      queue.push(result)
    }
  }

  const push = (text: string) => deliver({ done: false, value: encoder.encode(text) })
  const close = () => deliver({ done: true, value: undefined })

  const response = {
    ok: true,
    body: {
      getReader: () => ({
        read: (): Promise<ReadResult> => {
          const next = queue.shift()
          if (next) return Promise.resolve(next)
          return new Promise((resolve) => { waiting = resolve })
        },
      }),
    },
    text: () => Promise.resolve(''),
  }

  return { response, push, close }
}

/** All frames pushed up front, then closed — for tests that just want the
 *  final settled state. */
function fetchResolvedWith(frames: string[]) {
  const { response, push, close } = makeControllableResponse()
  for (const f of frames) push(f)
  close()
  return vi.fn(() => Promise.resolve(response as unknown as Response))
}

describe('useMealPlannerChat', () => {
  const weekStart = new Date('2026-07-19T00:00:00')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'tok-123' } as never },
      error: null,
    } as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('appends the user message and streams the assistant reply to done', async () => {
    vi.stubGlobal('fetch', fetchResolvedWith([
      frame({ type: 'text', text: 'Checking the plan...' }),
      frame({ type: 'tool', name: 'set_slot' }),
      frame({ type: 'text', text: 'Set Monday dinner to Tacos.' }),
      frame({ type: 'done', reply: 'Set Monday dinner to Tacos.' }),
    ]))

    const { result } = renderHook(() => useMealPlannerChat(weekStart))

    await act(async () => {
      await result.current.send('plan Monday dinner')
    })

    await waitFor(() => expect(result.current.busy).toBe(false))

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'plan Monday dinner' })
    expect(result.current.messages[1].role).toBe('assistant')
    expect(result.current.messages[1].content).toBe('Set Monday dinner to Tacos.')
    expect(result.current.messages[1].pending).toBe(false)
    expect(result.current.toolActivity).toBeNull()
  })

  it('sends the correct request shape: message, weekStart, history', async () => {
    const fetchMock = fetchResolvedWith([frame({ type: 'done', reply: 'ok' })])
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useMealPlannerChat(weekStart))
    await act(async () => { await result.current.send('first') })
    await waitFor(() => expect(result.current.busy).toBe(false))

    vi.stubGlobal('fetch', fetchResolvedWith([frame({ type: 'done', reply: 'ok2' })]))
    await act(async () => { await result.current.send('second') })
    await waitFor(() => expect(result.current.busy).toBe(false))

    const secondFetch = vi.mocked(fetch);
    expect(secondFetch).toHaveBeenCalledTimes(1)
    const [url, init] = secondFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/functions/v1/meal-planner-chat')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
    const body = JSON.parse(init.body as string)
    expect(body.weekStart).toBe('2026-07-19')
    expect(body.message).toBe('second')
    expect(body.history).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'ok' },
    ])
  })

  it('reports tool activity while a tool call is in flight, clears it on done', async () => {
    const { response, push, close } = makeControllableResponse()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response as unknown as Response)))

    const { result } = renderHook(() => useMealPlannerChat(weekStart))

    // Fire the send with a *synchronous* act() — it only flushes whatever
    // happens before the first await, so it resolves immediately instead of
    // holding an open async act scope until the whole exchange finishes.
    // (An un-awaited `act(async () => ...)` that never settles corrupts
    // React's act-environment tracking for every test that runs after it.)
    let sendPromise!: Promise<void>
    act(() => {
      sendPromise = result.current.send('do it')
    })

    push(frame({ type: 'tool', name: 'set_slot' }))
    await waitFor(() => expect(result.current.toolActivity).toBe('set_slot'))
    expect(result.current.busy).toBe(true)

    push(frame({ type: 'done', reply: 'Done.' }))
    close()
    await act(async () => { await sendPromise })

    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(result.current.toolActivity).toBeNull()
    expect(result.current.messages[1].content).toBe('Done.')
  })

  it('appends an error-prefixed assistant message when the fn emits an error event', async () => {
    vi.stubGlobal('fetch', fetchResolvedWith([frame({ type: 'error', message: 'Anthropic 500' })]))

    const { result } = renderHook(() => useMealPlannerChat(weekStart))
    await act(async () => { await result.current.send('hi') })
    await waitFor(() => expect(result.current.busy).toBe(false))

    expect(result.current.messages[1].content).toBe('Something went wrong: Anthropic 500')
    expect(result.current.toolActivity).toBeNull()
  })

  it('appends an error-prefixed assistant message when the request itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network dropped'))))

    const { result } = renderHook(() => useMealPlannerChat(weekStart))
    await act(async () => { await result.current.send('hi') })
    await waitFor(() => expect(result.current.busy).toBe(false))

    expect(result.current.messages[1].content).toBe('Something went wrong: network dropped')
  })

  it('clear() resets messages', async () => {
    vi.stubGlobal('fetch', fetchResolvedWith([frame({ type: 'done', reply: 'ok' })]))
    const { result } = renderHook(() => useMealPlannerChat(weekStart))
    await act(async () => { await result.current.send('hi') })
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(result.current.messages).toHaveLength(2)

    act(() => result.current.clear())
    expect(result.current.messages).toHaveLength(0)
  })

  it('ignores a blank send (no request made, no messages appended)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useMealPlannerChat(weekStart))

    await act(async () => { await result.current.send('   ') })

    expect(result.current.messages).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores a re-entrant send while busy', async () => {
    const { response, push, close } = makeControllableResponse()
    const fetchMock = vi.fn(() => Promise.resolve(response as unknown as Response))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useMealPlannerChat(weekStart))
    let sendPromise!: Promise<void>
    act(() => {
      sendPromise = result.current.send('first')
    })

    await waitFor(() => expect(result.current.busy).toBe(true))
    // Attempting a second send while the first is in flight should no-op.
    await act(async () => { await result.current.send('second') })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    push(frame({ type: 'done', reply: 'ok' }))
    close()
    await act(async () => { await sendPromise })
    await waitFor(() => expect(result.current.busy).toBe(false))
  })
})
