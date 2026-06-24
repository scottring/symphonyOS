import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMealPlan } from './useMealPlan'

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

vi.mock('@/lib/supabase', () => {
  const mockFrom = vi.fn()
  return {
    supabase: {
      from: mockFrom,
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })),
      },
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
    __mockFrom: mockFrom,
  }
})

import { __mockFrom } from '@/lib/supabase'

// The skipped suite below renders useMealPlan without GeneratePlanProvider.
// This block mocks the context so the hook runs, letting us assert that
// clearWeek propagates to other consumers (e.g. the Today timeline).
const { mockBump } = vi.hoisted(() => ({ mockBump: vi.fn() }))
vi.mock('@/contexts/GeneratePlanContext', () => ({
  useGeneratePlanContext: () => ({
    refreshSignal: 0,
    bumpRefreshSignal: mockBump,
    lastUndoToken: null,
    setLastUndoToken: vi.fn(),
  }),
}))

// Revived 2026-06: useMealPlan consumes useGeneratePlanContext (lifted state).
// The context is mocked above (see the GeneratePlanContext vi.mock), so the hook
// runs without needing a GeneratePlanProvider wrapper.
describe('useMealPlan', () => {
  beforeEach(() => {
    vi.mocked(__mockFrom as any).mockReset()
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

  it('clearWeek wipes entries via RPC and writes an undo token', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    const priorEntry = { id: 'e1', meal_plan_id: 'p1', day_of_week: 1, slot: 'dinner', recipe_id: 'r1', ad_hoc_title: null, notes: null, leftover_from: null, created_at: '2026-04-27T00:00:00Z' }
    const tokenRow = { id: 'tok-1' }

    vi.mocked(__mockFrom as any).mockImplementation((table: string) => {
      if (table === 'meal_plans') return makeQueryMock([planRow], planRow)
      if (table === 'ai_undo_tokens') return makeQueryMock([tokenRow], tokenRow)
      // meal_plan_entries: first the load, then the snapshot — both are the same .select call shape
      return makeQueryMock([priorEntry], priorEntry)
    })

    // Add the rpc mock
    const { supabase } = await import('@/lib/supabase')
    ;(supabase as any).rpc = vi.fn(() => Promise.resolve({ data: { inserted_ids: [] }, error: null }))

    const { result } = renderHook(() => useMealPlan(new Date('2026-04-27')))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let outcome: { ok: boolean; tokenId?: string; error?: string } | undefined
    await act(async () => {
      outcome = await result.current.clearWeek()
    })
    expect(outcome?.ok).toBe(true)
    expect(outcome?.tokenId).toBe('tok-1')
    expect((supabase as any).rpc).toHaveBeenCalledWith('regenerate_meal_plan', { p_meal_plan_id: 'p1', p_entries: [] })

    // Confirm ai_undo_tokens insert went through
    const tableCalls = vi.mocked(__mockFrom as any).mock.calls.map((c: any) => c[0])
    expect(tableCalls.includes('ai_undo_tokens')).toBe(true)
  })

  it('addMeal round-trips preparedByFamilyMemberId', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    const insertedEntry = { id: 'e1', meal_plan_id: 'p1', day_of_week: 1, slot: 'dinner', recipe_id: 'r1', ad_hoc_title: null, notes: null, leftover_from: null, prepared_by_family_member_id: 'fm-iris', created_at: '2026-04-27T00:00:00Z' }

    let lastInsertPayload: any = null
    vi.mocked(__mockFrom as any).mockImplementation((table: string) => {
      if (table === 'meal_plans') return makeQueryMock([planRow], planRow)
      // For meal_plan_entries, capture the insert payload
      const chain: any = {
        select: vi.fn(() => chain),
        insert: vi.fn((payload: any) => { lastInsertPayload = payload; return chain }),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve({ data: insertedEntry, error: null })),
        then: (resolve: any) => resolve({ data: [], error: null }),
      }
      return chain
    })

    const { result } = renderHook(() => useMealPlan(new Date('2026-04-27')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.addMeal({ dayOfWeek: 1, slot: 'dinner', recipeId: 'r1', preparedByFamilyMemberId: 'fm-iris' })
    })
    expect(lastInsertPayload?.prepared_by_family_member_id).toBe('fm-iris')
  })
})

describe('useMealPlan clearWeek cross-consumer propagation', () => {
  beforeEach(() => {
    vi.mocked(__mockFrom as any).mockReset()
    mockBump.mockReset()
  })

  // Regression: clearing the week only refreshed the local hook instance, so
  // the Today timeline (a separate useMealPlan instance in App.tsx) kept the
  // cleared meals on screen. Generate/undo bump the shared refresh signal;
  // clearWeek must do the same so every consumer refetches.
  it('bumps the shared refresh signal after clearing the week', async () => {
    const planRow = { id: 'p1', user_id: 'u1', week_start: '2026-04-27', parameter: null, created_at: '2026-04-27T00:00:00Z', updated_at: '2026-04-27T00:00:00Z' }
    const priorEntry = { id: 'e1', meal_plan_id: 'p1', day_of_week: 1, slot: 'dinner', recipe_id: 'r1', ad_hoc_title: null, notes: null, leftover_from: null, created_at: '2026-04-27T00:00:00Z' }
    const tokenRow = { id: 'tok-1' }

    vi.mocked(__mockFrom as any).mockImplementation((table: string) => {
      if (table === 'meal_plans') return makeQueryMock([planRow], planRow)
      if (table === 'ai_undo_tokens') return makeQueryMock([tokenRow], tokenRow)
      return makeQueryMock([priorEntry], priorEntry)
    })

    const { supabase } = await import('@/lib/supabase')
    ;(supabase as any).rpc = vi.fn(() => Promise.resolve({ data: { inserted_ids: [] }, error: null }))

    const { result } = renderHook(() => useMealPlan(new Date('2026-04-27')))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.clearWeek()
    })

    expect(mockBump).toHaveBeenCalled()
  })
})
