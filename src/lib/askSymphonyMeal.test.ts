import { describe, it, expect, vi } from 'vitest'
import { collectMealStream, fetchMealSuggestions } from './askSymphonyMeal'

function sse(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) { for (const l of lines) c.enqueue(enc.encode(l)); c.close() },
  })
}

describe('collectMealStream', () => {
  it('accumulates text deltas and returns final cards', async () => {
    const stream = sse([
      'data: {"type":"text","delta":"Hello "}\n\n',
      'data: {"type":"text","delta":"world"}\n\n',
      'data: {"type":"done","cards":[{"kind":"add","kicker":"k","title":"t","why":"w","apply":{"dayOfWeek":2,"slot":"dinner","adHocTitle":"X"}}],"text":"Hello world"}\n\n',
    ])
    const res = await collectMealStream(stream)
    expect(res.text).toBe('Hello world')
    expect(res.cards).toHaveLength(1)
    expect(res.cards[0].kind).toBe('add')
  })

  it('returns empty cards and error text on error event', async () => {
    const stream = sse(['data: {"type":"error","message":"boom"}\n\n'])
    const res = await collectMealStream(stream)
    expect(res.cards).toEqual([])
    expect(res.error).toBe('boom')
  })

  it('handles SSE lines split across chunks', async () => {
    const stream = sse([
      'data: {"type":"text","del',
      'ta":"Hi"}\n\n',
      'data: {"type":"done","cards":[],"text":"Hi"}\n\n',
    ])
    const res = await collectMealStream(stream)
    expect(res.text).toBe('Hi')
  })
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}))

describe('fetchMealSuggestions', () => {
  it('returns not-authenticated error when session is null', async () => {
    const res = await fetchMealSuggestions('suggest meals', new Date())
    expect(res).toEqual({ text: '', cards: [], error: 'not authenticated' })
  })
})
