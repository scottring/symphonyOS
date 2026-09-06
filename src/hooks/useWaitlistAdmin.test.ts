import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  order: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }))

import { useWaitlistAdmin } from './useWaitlistAdmin'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.mockResolvedValue({
    data: [
      { id: 'w2', email: 'b@example.com', created_at: '2026-09-04T00:00:00Z', approved_at: null },
      { id: 'w1', email: 'a@example.com', created_at: '2026-09-01T00:00:00Z', approved_at: '2026-09-03T00:00:00Z' },
    ],
    error: null,
  })
  mocks.select.mockReturnValue({ order: mocks.order })
  mocks.eq.mockResolvedValue({ error: null })
  mocks.update.mockReturnValue({ eq: mocks.eq })
  mocks.from.mockReturnValue({ select: mocks.select, update: mocks.update })
})

describe('useWaitlistAdmin', () => {
  it('loads rows ordered by created_at desc, with approved_at parsed', async () => {
    const { result } = renderHook(() => useWaitlistAdmin())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mocks.from).toHaveBeenCalledWith('waitlist')
    expect(mocks.select).toHaveBeenCalledWith('id,email,created_at,approved_at')
    expect(mocks.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result.current.rows.map((r) => r.id)).toEqual(['w2', 'w1'])
    expect(result.current.rows[0].approvedAt).toBeNull()
    expect(result.current.rows[1].approvedAt).toBeInstanceOf(Date)
  })

  it('approve() updates approved_at on the row and in local state', async () => {
    const { result } = renderHook(() => useWaitlistAdmin())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok: boolean | undefined
    await act(async () => { ok = await result.current.approve('w2') })

    expect(ok).toBe(true)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ approved_at: expect.any(String) }))
    expect(mocks.eq).toHaveBeenCalledWith('id', 'w2')
    expect(result.current.rows.find((r) => r.id === 'w2')?.approvedAt).toBeInstanceOf(Date)
    expect(result.current.approveError).toBeNull()
  })

  it('a refused approve does NOT flip the row — it reports the error', async () => {
    // This list is the signup gate itself. A row reading "approved" over a
    // write the database refused means an admin tells a founding household
    // they are in while the signup page keeps turning them away.
    mocks.eq.mockResolvedValue({ error: { message: 'permission denied for table waitlist' } })

    const { result } = renderHook(() => useWaitlistAdmin())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let ok: boolean | undefined
    await act(async () => { ok = await result.current.approve('w2') })

    expect(ok).toBe(false)
    expect(result.current.rows.find((r) => r.id === 'w2')?.approvedAt).toBeNull()
    expect(result.current.approveError).toMatch(/permission denied/)
  })

  it('clears a previous error once an approve succeeds', async () => {
    mocks.eq.mockResolvedValueOnce({ error: { message: 'nope' } })

    const { result } = renderHook(() => useWaitlistAdmin())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.approve('w2') })
    expect(result.current.approveError).toBe('nope')

    await act(async () => { await result.current.approve('w2') })
    expect(result.current.approveError).toBeNull()
    expect(result.current.rows.find((r) => r.id === 'w2')?.approvedAt).toBeInstanceOf(Date)
  })
})
