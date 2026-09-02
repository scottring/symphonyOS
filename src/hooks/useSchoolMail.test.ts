import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => {
  const rows = [
    {
      id: 'c1', subject: 'Field trip Friday', source_label: 'Sunrise Elementary',
      status: 'extracted', error: null, created_at: '2026-09-02T14:00:00Z',
    },
    {
      id: 'c2', subject: 'Picture day', source_label: 'ClassDojo',
      status: 'failed', error: 'model timeout', created_at: '2026-09-01T09:00:00Z',
    },
  ]
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null })
  const order = vi.fn(() => ({ limit }))
  const eqHousehold = vi.fn(() => ({ order }))
  const eqKind = vi.fn(() => ({ eq: eqHousehold }))
  const select = vi.fn(() => ({ eq: eqKind }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_user_household_id') return { data: 'hh-1', error: null }
    if (name === 'ensure_inbound_token') return { data: 'p7k2mq4x', error: null }
    return { data: null, error: null }
  })
  const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null })
  return { rows, limit, order, eqHousehold, eqKind, select, from, rpc, invoke }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { from: h.from, rpc: h.rpc, functions: { invoke: h.invoke } },
}))

import { useSchoolMail } from '@/hooks/useSchoolMail'

beforeEach(() => {
  h.rpc.mockClear()
  h.invoke.mockClear()
  h.limit.mockClear()
  h.eqKind.mockClear()
  h.eqHousehold.mockClear()
})

describe('useSchoolMail', () => {
  it('builds the household forwarding address from ensure_inbound_token', async () => {
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(h.rpc).toHaveBeenCalledWith('get_user_household_id')
    expect(h.rpc).toHaveBeenCalledWith('ensure_inbound_token', { p_household: 'hh-1' })
    expect(result.current.address).toBe('p7k2mq4x@symphony-os.com')
  })

  it('lists the household\'s recent email captures, newest first', async () => {
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(h.eqKind).toHaveBeenCalledWith('kind', 'email')
    expect(h.eqHousehold).toHaveBeenCalledWith('household_id', 'hh-1')
    expect(h.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(h.limit).toHaveBeenCalledWith(5)
    expect(result.current.recent).toEqual([
      {
        id: 'c1', subject: 'Field trip Friday', sourceLabel: 'Sunrise Elementary',
        status: 'extracted', error: null, createdAt: '2026-09-02T14:00:00Z',
      },
      {
        id: 'c2', subject: 'Picture day', sourceLabel: 'ClassDojo',
        status: 'failed', error: 'model timeout', createdAt: '2026-09-01T09:00:00Z',
      },
    ])
  })

  it('retry invokes capture-retry with the capture id, then refreshes', async () => {
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))
    h.limit.mockClear()

    await act(async () => { await result.current.retry('c2') })

    expect(h.invoke).toHaveBeenCalledWith('capture-retry', { body: { capture_id: 'c2' } })
    await waitFor(() => expect(h.limit).toHaveBeenCalled())
  })

  it('reports an error when the retry function fails, without throwing', async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.retry('c2') })

    await waitFor(() => expect(result.current.error).toBe('boom'))
  })

  it('never exposes an address when the user has no household', async () => {
    h.rpc.mockImplementationOnce(async () => ({ data: null, error: null }))
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.address).toBeNull()
    expect(result.current.recent).toEqual([])
  })
})
