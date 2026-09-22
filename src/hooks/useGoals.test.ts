import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useGoals } from './useGoals'
import type { DbGoal } from '@/types/goal'

const mockUser = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}))

function dbGoal(overrides: Partial<DbGoal> = {}): DbGoal {
  return {
    id: 'goal-1',
    user_id: 'test-user-id',
    area_id: null,
    name: 'Test Goal',
    year: 2026,
    notes: null,
    strategy: null,
    domain_slug: null,
    layer_id: null,
    context: null,
    status: 'active',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as DbGoal
}

// Tracks the payload passed to goals.insert(...).
const insertMock = vi.fn()
// Tracks the row returned by goals.select(...).eq('id', ...).single() — used
// for the duplicate-id readback path.
const selectSingleMock = vi.fn()
// Every .eq(...) the goals query makes — the fetch must not filter by year.
const goalsEqMock = vi.fn()
// What the initial goals fetch returns.
let goalRows: DbGoal[] = []

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'goals') {
        return {
          select: (_cols?: string) => {
            const chain: Record<string, unknown> = {}
            chain.eq = (field: string, value: unknown) => {
              goalsEqMock(field, value)
              if (field === 'id') {
                chain.single = () => selectSingleMock(value)
                return chain
              }
              chain.order = () => Promise.resolve({ data: [], error: null })
              return chain
            }
            chain.order = () => Promise.resolve({ data: goalRows, error: null })
            return chain
          },
          insert: (row: Record<string, unknown>) => {
            insertMock(row)
            return {
              select: () => ({
                single: async () => {
                  const next = (insertMock as unknown as { __nextResult?: () => unknown }).__nextResult
                  if (next) return next()
                  return { data: dbGoal({ ...row, id: (row.id as string) ?? 'goal-1' } as Partial<DbGoal>), error: null }
                },
              }),
            }
          },
        }
      }
      // goal_areas / goal_actions / goal_milestones — empty on fetch.
      return {
        select: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      }
    },
  },
}))

describe('useGoals addGoal', () => {
  beforeEach(() => {
    insertMock.mockReset()
    selectSingleMock.mockReset()
    goalsEqMock.mockReset()
    goalRows = []
    ;(insertMock as unknown as { __nextResult?: () => unknown }).__nextResult = undefined
  })

  it('addGoal writes year, strategy, carriedFrom and an explicit id in ONE insert', async () => {
    const { result } = renderHook(() => useGoals())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addGoal('a1', 'Get strong again', 'personal', {
        id: 'g-next',
        year: 2027,
        notes: 'n',
        strategy: 's',
        carriedFrom: 'g-prev',
      })
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      id: 'g-next',
      year: 2027,
      notes: 'n',
      strategy: 's',
      carried_from: 'g-prev',
      context: 'personal',
      area_id: 'a1',
    })
  })

  it('addGoal with an id that already exists returns the existing row and inserts nothing new', async () => {
    ;(insertMock as unknown as { __nextResult: () => unknown }).__nextResult = () => ({
      data: null,
      error: { code: '23505', message: 'duplicate' },
    })
    selectSingleMock.mockResolvedValueOnce({
      data: dbGoal({ id: 'g-next', name: 'Get strong again', year: 2027 }),
      error: null,
    })

    const { result } = renderHook(() => useGoals())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let g: Awaited<ReturnType<typeof result.current.addGoal>> = null
    await act(async () => {
      g = await result.current.addGoal(null, 'Get strong again', undefined, { id: 'g-next', year: 2027 })
    })

    expect(g?.id).toBe('g-next')
    expect(result.current.goals.filter((x) => x.id === 'g-next')).toHaveLength(1)
  })

  it('fetches EVERY year of goals — the year page plans next year and looks back at last (regression)', async () => {
    goalRows = [
      dbGoal({ id: 'g-2025', name: 'Last year', year: 2025 }),
      dbGoal({ id: 'g-2026', name: 'This year', year: 2026 }),
      dbGoal({ id: 'g-2027', name: 'Next year', year: 2027 }),
    ]

    const { result } = renderHook(() => useGoals())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // No `.eq('year', …)` anywhere in the goals query.
    expect(goalsEqMock.mock.calls.filter(([field]) => field === 'year')).toHaveLength(0)
    expect(result.current.goals.map((g) => g.year).sort()).toEqual([2025, 2026, 2027])
  })
})
