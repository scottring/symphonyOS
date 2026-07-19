import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMealSlotSuggestions } from './useMealSlotSuggestions'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { access_token: 'tok-abc' } }, error: null }),
      ),
    },
  },
}))

import { supabase } from '@/lib/supabase'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

describe('useMealSlotSuggestions', () => {
  const args = { weekStart: new Date('2026-07-19T00:00:00'), dayOfWeek: 3, slot: 'dinner' as const, intent: 'something lighter' }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'tok-abc' } as never }, error: null,
    } as never)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('posts weekStart/dayOfWeek/slot/intent with the bearer token', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ suggestions: [] })))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useMealSlotSuggestions())
    await act(async () => { await result.current.suggest(args) })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/functions/v1/meal-slot-suggest')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-abc')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ weekStart: '2026-07-19', dayOfWeek: 3, slot: 'dinner', intent: 'something lighter' })
  })

  it('exposes parsed suggestions on success', async () => {
    const suggestions = [
      { source: 'shelf', recipeId: 'r1', title: 'Salmon', why: 'uses the dill' },
      { source: 'new', title: 'Farro Bowl', why: 'veggie night', ingredients: ['farro'], instructions: ['cook'] },
    ]
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ suggestions }))))

    const { result } = renderHook(() => useMealSlotSuggestions())
    await act(async () => { await result.current.suggest(args) })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.suggestions).toEqual(suggestions)
    expect(result.current.error).toBeNull()
  })

  it('surfaces an error and clears suggestions when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse('boom', false, 502))))

    const { result } = renderHook(() => useMealSlotSuggestions())
    await act(async () => { await result.current.suggest(args) })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('boom')
    expect(result.current.suggestions).toEqual([])
  })

  it('reset() clears suggestions and error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ suggestions: [{ source: 'shelf', recipeId: 'r1', title: 'X', why: 'y' }] }))))
    const { result } = renderHook(() => useMealSlotSuggestions())
    await act(async () => { await result.current.suggest(args) })
    expect(result.current.suggestions).toHaveLength(1)

    act(() => result.current.reset())
    expect(result.current.suggestions).toEqual([])
    expect(result.current.error).toBeNull()
  })
})
