import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const m = vi.hoisted(() => ({
  insert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })),
  invoke: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
}))
vi.mock('@/lib/supabase', () => ({
  getAuthUser: async () => ({ data: { user: { id: 'u1' } } }),
  supabase: {
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    from: () => ({ insert: m.insert }),
    functions: { invoke: m.invoke },
  },
}))
import { usePhotoCapture } from './usePhotoCapture'

// jsdom has no canvas encoder; the JPEG step is not what is under test.
beforeEach(() => {
  m.insert.mockClear(); m.invoke.mockReset(); m.invoke.mockResolvedValue({ error: null })
  globalThis.createImageBitmap = vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })) as never
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['j'], { type: 'image/jpeg' })) }
})
const file = () => new File(['x'], 'screenshot.jpg', { type: 'image/jpeg' })

describe('usePhotoCapture', () => {
  it('a screenshot’s Inbox placeholder says screenshot, not photo', async () => {
    const { result } = renderHook(() => usePhotoCapture())
    await act(async () => { await result.current.captureFromFile(file(), null, 'screenshot') })
    expect(m.insert.mock.calls[0][0]).toMatchObject({ title: 'Reading screenshot…' })
    expect(result.current.status).toBe('started')
  })

  it('hands back the events the reading found, for the box to offer', async () => {
    const event = { title: 'Flight BWI → BOS', start: '2026-12-04T22:10:00.000Z', end: null, allDay: false, location: null, who: ['Iris Leviner'], details: null }
    m.invoke.mockResolvedValue({ data: { ok: true, events: [event], links: [{ url: 'https://southwest.com', title: 'Manage' }] }, error: null } as never)
    const { result } = renderHook(() => usePhotoCapture())
    let out: Awaited<ReturnType<typeof result.current.captureFromFile>> = null
    await act(async () => { out = await result.current.captureFromFile(file(), null, 'screenshot') })
    expect(out).toMatchObject({ events: [event], links: [{ url: 'https://southwest.com' }] })
    expect((out as unknown as { taskId: string }).taskId).toBe(m.insert.mock.calls[0][0].id)
  })

  // 2026-10-30: the spend controls refused every image and the box still said
  // "Reading it now" while the Inbox row sat at "Analyzing photo…".
  it('a refused reading is said in the box, with the server’s reason', async () => {
    const reason = 'AI is unavailable while its usage controls are not ready.'
    m.invoke.mockResolvedValue({ error: { message: 'non-2xx', context: new Response(JSON.stringify({ error: reason })) } })
    const { result } = renderHook(() => usePhotoCapture())
    let ok: unknown = 'unset'
    await act(async () => { ok = await result.current.captureFromFile(file(), null) })
    expect(ok).toBeNull()
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe(reason)
  })
})
