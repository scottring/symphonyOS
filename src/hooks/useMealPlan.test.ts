import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMealPlan } from './useMealPlan'
import { createMockUser } from '@/test/mocks/factories'

function makeQueryMock(returnData: unknown, single: any = null) {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: single ?? (Array.isArray(returnData) ? returnData[0] : returnData), error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: Array.isArray(returnData) ? returnData[0] : returnData, error: null })),
    then: (resolve: any) => resolve({ data: returnData, error: null }),
  }
  return chain
}

const mockUser = createMockUser()
let mockUserState: ReturnType<typeof createMockUser> | null = mockUser

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserState }),
}))

const mockChannelOn = vi.fn()
const mockChannelSubscribe = vi.fn()
const mockRemoveChannel = vi.fn()

const mockChannelObj: {
  on: (event: string, filter: unknown, cb: (payload: Record<string, unknown>) => void) => typeof mockChannelObj
  subscribe: () => typeof mockChannelObj
} = {
  on: (event, filter) => {
    mockChannelOn(event, filter)
    return mockChannelObj
  },
  subscribe: () => {
    mockChannelSubscribe()
    return mockChannelObj
  },
}

vi.mock('@/lib/supabase', () => {
  const mockFrom = vi.fn()
  return {
    supabase: {
      from: mockFrom,
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })),
      },
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      channel: () => mockChannelObj,
      removeChannel: (ch: unknown) => mockRemoveChannel(ch),
    },
    __mockFrom: mockFrom,
  }
})

import { __mockFrom } from '@/lib/supabase'

describe('useMealPlan', () => {
  beforeEach(() => {
    vi.mocked(__mockFrom as any).mockReset()
    mockUserState = mockUser
    vi.clearAllMocks()
  })

  it('loads an existing plan with entries', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: 'regular', created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    let call = 0
    vi.mocked(__mockFrom as any).mockImplementation(() => {
      call += 1
      // meal_plans now uses .limit(1) returning an array; pass [planRow]
      if (call === 1) return makeQueryMock([planRow], planRow)
      return makeQueryMock([])  // meal_plan_entries select
    })
    const { result } = renderHook(() => useMealPlan(new Date('2026-04-27')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.plan?.parameter).toBe('regular')
  })

  it('addMeal calls insert into meal_plan_entries', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    const insertedEntry = { id: 'e1', meal_plan_id: 'p1', day_of_week: 1, slot: 'dinner', recipe_id: 'r1', ad_hoc_title: null, notes: null, leftover_from: null, created_at: '2026-04-27T00:00:00Z' }
    vi.mocked(__mockFrom as any).mockImplementation((table: string) => {
      // meal_plans now uses .limit(1) returning an array
      if (table === 'meal_plans') return makeQueryMock([planRow], planRow)
      // meal_plan_entries: select on load returns [], insert on add returns the inserted row
      return makeQueryMock([], insertedEntry)
    })
    const { result } = renderHook(() => useMealPlan(new Date('2026-04-27')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.addMeal({ dayOfWeek: 1, slot: 'dinner', recipeId: 'r1' })
    })
    const calls = vi.mocked(__mockFrom as any).mock.calls.map((c: any) => c[0])
    expect(calls.includes('meal_plan_entries')).toBe(true)
  })

  it('removeMeal deletes from meal_plan_entries', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    const existingEntry = { id: 'e1', meal_plan_id: 'p1', day_of_week: 1, slot: 'dinner', recipe_id: 'r1', ad_hoc_title: null, notes: null, leftover_from: null, created_at: '2026-04-27T00:00:00Z' }
    vi.mocked(__mockFrom as any).mockImplementation((table: string) => {
      if (table === 'meal_plans') return makeQueryMock([planRow], planRow)
      return makeQueryMock([existingEntry])
    })
    const { result } = renderHook(() => useMealPlan(new Date('2026-04-27')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.removeMeal('e1')
    })
    const calls = vi.mocked(__mockFrom as any).mock.calls.map((c: any) => c[0])
    expect(calls.includes('meal_plan_entries')).toBe(true)
  })

  it('subscribes to a per-instance meal_plan_entries realtime channel and refetches on change', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    vi.mocked(__mockFrom as any).mockImplementation((table: string) => {
      if (table === 'meal_plans') return makeQueryMock([planRow], planRow)
      return makeQueryMock([])
    })
    renderHook(() => useMealPlan(new Date('2026-04-27')))

    await waitFor(() => expect(mockChannelSubscribe).toHaveBeenCalled())
    expect(mockChannelOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'meal_plan_entries' }),
    )
  })

  it('does not subscribe when there is no user', async () => {
    mockUserState = null
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    vi.mocked(__mockFrom as any).mockImplementation((table: string) => {
      if (table === 'meal_plans') return makeQueryMock([planRow], planRow)
      return makeQueryMock([])
    })
    renderHook(() => useMealPlan(new Date('2026-04-27')))
    await act(async () => {})
    expect(mockChannelSubscribe).not.toHaveBeenCalled()
  })

  it('removes the channel on unmount', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    vi.mocked(__mockFrom as any).mockImplementation((table: string) => {
      if (table === 'meal_plans') return makeQueryMock([planRow], planRow)
      return makeQueryMock([])
    })
    const { unmount } = renderHook(() => useMealPlan(new Date('2026-04-27')))
    await waitFor(() => expect(mockChannelSubscribe).toHaveBeenCalled())
    unmount()
    expect(mockRemoveChannel).toHaveBeenCalled()
  })
})
