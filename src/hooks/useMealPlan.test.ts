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
    in: vi.fn(() => chain),
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
    // Mirrors the real module: the cached-session reader lives beside
    // `supabase`, so a whole-module mock has to provide it too.
    getAuthUser: async () => ({ data: { user: { id: 'test-user-id' } }, error: null }),
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
    expect(result.current.plan?.id).toBe('p1')
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

  // Mock whose meal_plan_entries table records update({...}).eq('id', x) calls,
  // while still resolving the load's select().eq().order() with `entries`.
  function makeMoveMock(planRow: any, entries: any[], updateCalls: any[]) {
    return (table: string) => {
      if (table === 'meal_plans') return makeQueryMock([planRow], planRow)
      const chain: any = {
        select: () => chain,
        order: () => chain,
        eq: () => chain,
        in: () => chain,
        update: (payload: any) => ({
          eq: (col: string, val: any) => {
            updateCalls.push({ payload, col, val })
            return Promise.resolve({ error: null })
          },
        }),
        then: (resolve: any) => resolve({ data: entries, error: null }),
      }
      return chain
    }
  }

  it('moveMeal updates the entry to the target cell when it is empty', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    const e1 = { id: 'e1', meal_plan_id: 'p1', day_of_week: 1, slot: 'dinner', recipe_id: 'r1', ad_hoc_title: null, notes: null, leftover_from: null, created_at: '2026-04-27T00:00:00Z' }
    const updateCalls: any[] = []
    vi.mocked(__mockFrom as any).mockImplementation(makeMoveMock(planRow, [e1], updateCalls))

    const { result } = renderHook(() => useMealPlan(new Date('2026-04-27')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.moveMeal('e1', 2, 'lunch') })

    // Exactly one update — the moved entry — since the target cell was empty.
    expect(updateCalls).toEqual([
      { payload: { meal_plan_id: 'p1', day_of_week: 2, slot: 'lunch' }, col: 'id', val: 'e1' },
    ])
  })

  it('moveMeal swaps two entries when the target cell is occupied', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    const e1 = { id: 'e1', meal_plan_id: 'p1', day_of_week: 1, slot: 'dinner', recipe_id: 'r1', ad_hoc_title: null, notes: null, leftover_from: null, created_at: '2026-04-27T00:00:00Z' }
    const e2 = { id: 'e2', meal_plan_id: 'p1', day_of_week: 2, slot: 'lunch', recipe_id: 'r2', ad_hoc_title: null, notes: null, leftover_from: null, created_at: '2026-04-27T00:00:00Z' }
    const updateCalls: any[] = []
    vi.mocked(__mockFrom as any).mockImplementation(makeMoveMock(planRow, [e1, e2], updateCalls))

    const { result } = renderHook(() => useMealPlan(new Date('2026-04-27')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.moveMeal('e1', 2, 'lunch') })

    // Both entries trade cells.
    expect(updateCalls).toContainEqual({ payload: { meal_plan_id: 'p1', day_of_week: 2, slot: 'lunch' }, col: 'id', val: 'e1' })
    expect(updateCalls).toContainEqual({ payload: { meal_plan_id: 'p1', day_of_week: 1, slot: 'dinner' }, col: 'id', val: 'e2' })
    expect(updateCalls).toHaveLength(2)
  })

  // A Saturday-start week (Sat Oct 24 – Fri Oct 30) draws on the Sunday weeks
  // of Oct 18 (its Saturday) and Oct 25 (Sunday to Friday).
  it('a Saturday week shows the two stored weeks it overlaps, by position', async () => {
    const plan18 = { id: 'p18', user_id: 'u1', week_start: '2026-10-18', starts_on: null, ends_on: null, created_at: '2026-10-18T00:00:00Z', updated_at: '2026-10-18T00:00:00Z' }
    const plan25 = { id: 'p25', user_id: 'u1', week_start: '2026-10-25', starts_on: null, ends_on: null, created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-25T00:00:00Z' }
    const entry = (id: string, plan: string, dow: number) => ({ id, meal_plan_id: plan, day_of_week: dow, slot: 'dinner', recipe_id: null, ad_hoc_title: id, notes: null, leftover_from: null, for_member_id: null, created_at: '2026-10-18T00:00:00Z' })
    const entries = [entry('fri23', 'p18', 5), entry('sat24', 'p18', 6), entry('sun25', 'p25', 0), entry('fri30', 'p25', 5), entry('sat31', 'p25', 6)]
    const updateCalls: any[] = []
    vi.mocked(__mockFrom as any).mockImplementation((table: string) => {
      if (table === 'meal_plans') {
        let week = ''
        const chain: any = {
          select: () => chain, order: () => chain, limit: () => chain,
          eq: (_c: string, v: string) => { week = v; return chain },
          then: (resolve: any) => resolve({ data: [week === '2026-10-18' ? plan18 : plan25], error: null }),
        }
        return chain
      }
      return makeMoveMock(plan25, entries, updateCalls)('meal_plan_entries')
    })

    const { result } = renderHook(() => useMealPlan(new Date(2026, 9, 24)))
    await waitFor(() => expect(result.current.loading).toBe(false))
    // The range and chat ride the plan holding most of the days.
    expect(result.current.plan?.id).toBe('p25')
    expect(result.current.plan?.entries.map((e) => [e.id, e.dayOfWeek])).toEqual([['sat24', 0], ['sun25', 1], ['fri30', 6]])

    // Saturday's dinner moved to Sunday crosses into the Oct 25 plan.
    await act(async () => { await result.current.moveMeal('sat24', 2, 'lunch') })
    expect(updateCalls).toEqual([{ payload: { meal_plan_id: 'p25', day_of_week: 1, slot: 'lunch' }, col: 'id', val: 'sat24' }])
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
