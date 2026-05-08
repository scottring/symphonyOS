// src/hooks/useHomes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useHomes } from './useHomes'

vi.mock('@/lib/supabase', () => {
  const builders = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    order: vi.fn(),
  }
  return {
    supabase: {
      from: vi.fn(() => builders),
      __builders: builders,
    },
  }
})

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

const FIXTURE = {
  id: 'home-1',
  user_id: 'user-1',
  name: 'Main House',
  address: null,
  created_at: '2026-05-06T00:00:00Z',
  updated_at: '2026-05-06T00:00:00Z',
}

describe('useHomes', () => {
  beforeEach(async () => {
    const { supabase } = await import('@/lib/supabase')
    const b = (supabase as any).__builders
    b.select.mockReturnValue(b)
    b.eq.mockReturnValue(b)
    b.order.mockResolvedValue({ data: [FIXTURE], error: null })
    b.insert.mockReturnValue(b)
    b.single.mockResolvedValue({ data: FIXTURE, error: null })
  })

  it('loads homes on mount and maps DB shape', async () => {
    const { result } = renderHook(() => useHomes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.homes).toHaveLength(1)
    expect(result.current.homes[0].id).toBe('home-1')
    expect(result.current.homes[0].name).toBe('Main House')
    expect(result.current.homes[0].createdAt).toBeInstanceOf(Date)
  })

  it('addHome inserts and returns the new home', async () => {
    const { result } = renderHook(() => useHomes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const created = await act(async () => result.current.addHome({ name: 'New' }))
    expect(created?.name).toBe('Main House') // mocked single() returns fixture
  })
})
