import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    storage: { from: vi.fn(() => ({ upload: vi.fn().mockResolvedValue({ error: null }) })) },
  },
  getAuthUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
}))

import { supabase } from '@/lib/supabase'
import { usePageFromPaper } from './usePageFromPaper'

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  invoke.mockReset()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }))
})

describe('usePageFromPaper', () => {
  it('a 401 from parse-page throws SessionExpiredError, not a parse failure', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: { status: 401 } }),
    })
    const { result } = renderHook(() => usePageFromPaper([]))
    await act(() => result.current.parseFromBlob(new Blob(['x'], { type: 'image/jpeg' }), 'week'))
    expect(result.current.error).toBe('Your session ended. Sign in again to continue.')
    expect(result.current.status).toBe('error')
  })

  it('a non-401 function error surfaces its own message', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('boom'), { context: { status: 500 } }),
    })
    const { result } = renderHook(() => usePageFromPaper([]))
    await act(() => result.current.parseFromBlob(new Blob(['x'], { type: 'image/jpeg' }), 'week'))
    expect(result.current.error).toBe('boom')
  })
})

describe('usePageFromPaper.parseFromStoragePath', () => {
  it('reads a page the phone already uploaded — no upload, same parse call', async () => {
    invoke.mockResolvedValue({ data: { ok: true, items: [], notes: [], unclear: [], window: [], altitude: 'season', storagePath: 'u1/page/handoff-abc.jpg' }, error: null })
    vi.mocked(supabase.storage.from).mockClear()
    const { result } = renderHook(() => usePageFromPaper([]))
    await act(() => result.current.parseFromStoragePath('u1/page/handoff-abc.jpg', 'season'))
    expect(supabase.storage.from).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0][1].body).toMatchObject({ storagePath: 'u1/page/handoff-abc.jpg', altitude: 'season' })
    expect(result.current.status).toBe('ready')
    expect(result.current.result.storagePath).toBe('u1/page/handoff-abc.jpg')
  })
})
