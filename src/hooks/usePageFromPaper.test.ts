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
