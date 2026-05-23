import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSpaces } from './useSpaces'

vi.mock('@/lib/supabase', () => {
  const b = {
    select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
    eq: vi.fn(), single: vi.fn(), order: vi.fn(),
  }
  return { supabase: { from: vi.fn(() => b), __builders: b } }
})
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const ROOM = { id: 'room-1', home_id: 'h1', parent_space_id: null, space_type: 'room',
  name: 'Kitchen', photo_url: null, sort_order: 0, facts: [], created_by: 'u1',
  created_at: '2026-05-06T00:00:00Z', updated_at: '2026-05-06T00:00:00Z' }

// A zone used to test nesting guards — its id matches the parentSpaceId in the
// addZone test so that spaces.find() resolves it and the guard fires.
const ZONE_X = { id: 'zone-x', home_id: 'h1', parent_space_id: 'room-1', space_type: 'zone',
  name: 'Pantry', photo_url: null, sort_order: 1, facts: [], created_by: 'u1',
  created_at: '2026-05-06T00:00:00Z', updated_at: '2026-05-06T00:00:00Z' }

describe('useSpaces', () => {
  beforeEach(async () => {
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.select.mockReturnValue(b); b.eq.mockReturnValue(b)
    b.order.mockResolvedValue({ data: [ROOM, ZONE_X], error: null })
    b.insert.mockReturnValue(b)
    b.single.mockResolvedValue({ data: ROOM, error: null })
  })

  it('loads spaces filtered by homeId', async () => {
    const { result } = renderHook(() => useSpaces('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    // ROOM + ZONE_X are both returned by the mock
    expect(result.current.spaces).toHaveLength(2)
    expect(result.current.rooms).toHaveLength(1)
    expect(result.current.zones).toHaveLength(1)
  })

  it('addZone refuses to nest under another zone', async () => {
    const { result } = renderHook(() => useSpaces('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await expect(
      act(async () => result.current.addZone({ parentSpaceId: 'zone-x', name: 'sub' }))
    ).rejects.toThrow(/zones cannot be nested/i)
  })
})
