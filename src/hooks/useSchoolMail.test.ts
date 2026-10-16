import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }))
vi.mock(
  '@/lib/supabase',
  () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }),
)
import { useSchoolMail } from './useSchoolMail'
const overview = { householdId: 'h', address: null, members: [], messages: [] }
beforeEach(() => {
  h.rpc.mockReset()
  h.invoke.mockReset()
  h.rpc.mockResolvedValue({ data: overview, error: null })
  h.invoke.mockResolvedValue({ data: { ok: true }, error: null })
})
describe('school mail setup and saving', () => {
  it('reads setup without creating a forwarding address', async () => {
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(h.rpc).toHaveBeenCalledWith('school_mail_overview', {
      p_enable: false,
    })
    expect(result.current.address).toBeNull()
  })
  it('enables the address only after the user chooses setup', async () => {
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.enable())
    expect(h.rpc).toHaveBeenCalledWith('school_mail_overview', {
      p_enable: true,
    })
  })
  it('uses the durable save receipt and does not claim success after failure', async () => {
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))
    h.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'network lost' },
    })
    await expect(result.current.save('c', [])).rejects.toThrow(/not confirmed/)
    expect(h.rpc).toHaveBeenLastCalledWith('save_school_mail_review', {
      p_capture: 'c',
      p_items: [],
    })
  })
  it('returns the server receipt even if the selection has been saved already', async () => {
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const receipt = {
      status: 'saved',
      count: 1,
      items: [{ id: 't', kind: 'task', title: 'School form' }],
    }
    h.rpc.mockResolvedValueOnce({ data: receipt, error: null })
    let actual
    await act(async () => {
      actual = await result.current.save('c', [])
    })
    expect(actual).toEqual(receipt)
  })
  it('shows a load error without replacing existing data with an empty result', async () => {
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
    await act(() => result.current.refresh())
    expect(result.current.householdId).toBe('h')
    expect(result.current.error).toMatch(/Could not load/)
  })
  it('retries through the authenticated endpoint', async () => {
    const { result } = renderHook(() => useSchoolMail())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.retry('c'))
    expect(h.invoke).toHaveBeenCalledWith('capture-retry', {
      body: { capture_id: 'c' },
    })
  })
})
