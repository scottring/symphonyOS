import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAssets } from './useAssets'

vi.mock('@/lib/supabase', () => {
  const b = {
    select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
    eq: vi.fn(), single: vi.fn(), order: vi.fn(),
  }
  return { supabase: { from: vi.fn(() => b), __builders: b } }
})
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

const ASSET = {
  id: 'a1', home_id: 'h1', space_id: 'room-1', asset_kind: 'item',
  asset_type: 'appliance', name: 'Dishwasher', photo_url: null,
  purchase_date: null, purchase_price: null, warranty_expires_at: null,
  serial_number: null, manual_url: null, tags: [], details: {},
  notes_id: null, domain: 'family', needs_details: false,
  created_by: 'u1', created_at: '2026-05-06T00:00:00Z', updated_at: '2026-05-06T00:00:00Z',
}

describe('useAssets', () => {
  beforeEach(async () => {
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.select.mockReturnValue(b); b.eq.mockReturnValue(b)
    b.order.mockResolvedValue({ data: [ASSET], error: null })
    b.insert.mockReturnValue(b)
    b.single.mockResolvedValue({ data: ASSET, error: null })
  })

  it('loads assets for a home', async () => {
    const { result } = renderHook(() => useAssets('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assets).toHaveLength(1)
    expect(result.current.assets[0].name).toBe('Dishwasher')
  })

  it('captureAsset sets needs_details=true', async () => {
    const { result } = renderHook(() => useAssets('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let createdInsert: any
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.insert.mockImplementation((row: any) => { createdInsert = row; return b })
    await act(async () => result.current.captureAsset({ name: 'Bike', spaceId: 'room-1' }))
    expect(createdInsert.needs_details).toBe(true)
  })

  it('needsDetailsAssets filters correctly', async () => {
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.order.mockResolvedValueOnce({ data: [{ ...ASSET, needs_details: true }, ASSET], error: null })
    const { result } = renderHook(() => useAssets('h1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.needsDetailsAssets).toHaveLength(1)
  })
})
