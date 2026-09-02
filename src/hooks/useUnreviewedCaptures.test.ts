import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useUnreviewedCaptures } from '@/hooks/useUnreviewedCaptures'

const rows = [
  {
    id: 'cap-2',
    subject: 'Hillside Weekly Update',
    source_label: 'Hillside Elementary',
    created_at: '2026-09-02T11:00:00Z',
  },
  {
    id: 'cap-1',
    subject: null,
    source_label: null,
    created_at: '2026-09-01T09:00:00Z',
  },
]

// The read is a chain: select → eq(kind) → eq(status) → is(reviewed_at) →
// order → limit. Each link is captured so the test can assert the filter is
// the one the spec names, not just that *something* was fetched.
const limit = vi.fn().mockResolvedValue({ data: rows, error: null })
const order = vi.fn(() => ({ limit }))
const isNull = vi.fn(() => ({ order }))
const eqStatus = vi.fn(() => ({ is: isNull }))
const eqKind = vi.fn(() => ({ eq: eqStatus }))
const select = vi.fn(() => ({ eq: eqKind }))

const updateIn = vi.fn().mockResolvedValue({ error: null })
const update = vi.fn(() => ({ in: updateIn }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select, update })),
  },
}))

vi.mock('@/hooks/useToast', () => ({ showToast: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  limit.mockResolvedValue({ data: rows, error: null })
  updateIn.mockResolvedValue({ error: null })
})

describe('useUnreviewedCaptures', () => {
  it('reads email captures that were extracted but never reviewed', async () => {
    const { result } = renderHook(() => useUnreviewedCaptures())
    await waitFor(() => expect(result.current.captures).toHaveLength(2))

    expect(select).toHaveBeenCalledWith('id, subject, source_label, created_at')
    expect(eqKind).toHaveBeenCalledWith('kind', 'email')
    expect(eqStatus).toHaveBeenCalledWith('status', 'extracted')
    expect(isNull).toHaveBeenCalledWith('reviewed_at', null)
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(10)
  })

  it('maps the row shape the review surfaces read', async () => {
    const { result } = renderHook(() => useUnreviewedCaptures())
    await waitFor(() => expect(result.current.captures).toHaveLength(2))

    expect(result.current.captures[0]).toEqual({
      id: 'cap-2',
      subject: 'Hillside Weekly Update',
      sourceLabel: 'Hillside Elementary',
      createdAt: new Date('2026-09-02T11:00:00Z'),
    })
    expect(result.current.captures[1].subject).toBeNull()
    expect(result.current.captures[1].sourceLabel).toBeNull()
  })

  it('markReviewed stamps reviewed_at and drops the rows locally', async () => {
    const { result } = renderHook(() => useUnreviewedCaptures())
    await waitFor(() => expect(result.current.captures).toHaveLength(2))

    await act(async () => { await result.current.markReviewed(['cap-2']) })

    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0]).toHaveProperty('reviewed_at')
    expect(updateIn).toHaveBeenCalledWith('id', ['cap-2'])
    expect(result.current.captures.map((c) => c.id)).toEqual(['cap-1'])
  })

  it('markReviewed writes nothing for an empty list', async () => {
    const { result } = renderHook(() => useUnreviewedCaptures())
    await waitFor(() => expect(result.current.captures).toHaveLength(2))

    await act(async () => { await result.current.markReviewed([]) })

    expect(update).not.toHaveBeenCalled()
    expect(result.current.captures).toHaveLength(2)
  })

  it('keeps the rows when the review stamp fails', async () => {
    updateIn.mockResolvedValue({ error: { message: 'denied' } })
    const { result } = renderHook(() => useUnreviewedCaptures())
    await waitFor(() => expect(result.current.captures).toHaveLength(2))

    await act(async () => { await result.current.markReviewed(['cap-2']) })

    expect(result.current.captures).toHaveLength(2)
  })
})
