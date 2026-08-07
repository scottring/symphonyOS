import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useEntityContext } from './useEntityContext'
import { createMockUser } from '@/test/mocks/factories'

// Module-level state for mocking (convention from useEventNotes.test.ts)
const mockUser = createMockUser()
let mockUserState: ReturnType<typeof createMockUser> | null = mockUser

let mockSuggestionsResult: { data: unknown; error: unknown } = { data: [], error: null }
let mockHistoryResult: { data: unknown; error: unknown } = { data: [], error: null }
let mockUpdateResult: { error: unknown } = { error: null }
let mockInsertResult: { error: unknown } = { error: null }

const mockSuggestionsEq = vi.fn()
const mockSuggestionsOrder = vi.fn()
const mockHistoryEq = vi.fn()
const mockHistoryOrder = vi.fn()
const mockHistoryLimit = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateEq = vi.fn()
const mockInsert = vi.fn()

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserState }),
}))

// Chainable mock matching the exact query shapes the hook issues:
// proactive_suggestions: select('*').eq(user_id).eq(entity_type).eq(entity_id).eq(status).or(unexpired).order(confidence)
// action_history: select(cols).eq(user_id).eq(entity_type).eq(entity_id).order(created_at).limit(1)
// The nesting itself enforces the shape non-vacuously: if the hook drops the
// leading .eq('user_id', ...) call, the mock records only 3 (suggestions) or
// 2 (history) eq() invocations instead of 4/3, so the explicit
// toHaveBeenCalledWith('user_id', ...) assertions below fail.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'proactive_suggestions') {
        return {
          select: () => ({
            eq: (f1: string, v1: string) => {
              mockSuggestionsEq(f1, v1)
              return {
                eq: (f2: string, v2: string) => {
                  mockSuggestionsEq(f2, v2)
                  return {
                    eq: (f3: string, v3: string) => {
                      mockSuggestionsEq(f3, v3)
                      return {
                        eq: (f4: string, v4: string) => {
                          mockSuggestionsEq(f4, v4)
                          return {
                            // .or(unexpiredFilter()) — status 'active' alone
                            // never expired anything; see suggestionFreshness.ts.
                            or: () => ({
                              order: (col: string, opts: unknown) => {
                                mockSuggestionsOrder(col, opts)
                                return Promise.resolve(mockSuggestionsResult)
                              },
                            }),
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
          }),
          update: (data: unknown) => {
            mockUpdate(data)
            return {
              eq: (f: string, v: string) => {
                mockUpdateEq(f, v)
                return Promise.resolve(mockUpdateResult)
              },
            }
          },
        }
      }
      if (table === 'action_history') {
        return {
          select: () => ({
            eq: (f1: string, v1: string) => {
              mockHistoryEq(f1, v1)
              return {
                eq: (f2: string, v2: string) => {
                  mockHistoryEq(f2, v2)
                  return {
                    eq: (f3: string, v3: string) => {
                      mockHistoryEq(f3, v3)
                      return {
                        order: (col: string, opts: unknown) => {
                          mockHistoryOrder(col, opts)
                          return {
                            limit: (n: number) => {
                              mockHistoryLimit(n)
                              return Promise.resolve(mockHistoryResult)
                            },
                          }
                        },
                      }
                    },
                  }
                },
              }
            },
          }),
          insert: (data: unknown) => {
            mockInsert(data)
            return Promise.resolve(mockInsertResult)
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  },
}))

const suggestionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  user_id: mockUser.id,
  entity_type: 'task',
  entity_id: 'task-1',
  suggestion_type: 'call',
  title: 'Call the vet',
  detail: null,
  confidence: 0.9,
  action_type: 'call',
  action_payload: { phoneNumber: '555-1234' },
  status: 'active',
  acted_at: null,
  dismissed_at: null,
  expires_at: null,
  suggestion_key: 'k1',
  generated_at: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
})

describe('useEntityContext', () => {
  beforeEach(() => {
    mockUserState = mockUser
    mockSuggestionsResult = { data: [], error: null }
    mockHistoryResult = { data: [], error: null }
    mockUpdateResult = { error: null }
    mockInsertResult = { error: null }
    vi.clearAllMocks()
  })

  it('returns active suggestions for the entity ordered by confidence', async () => {
    mockSuggestionsResult = { data: [suggestionRow()], error: null }

    const { result } = renderHook(() => useEntityContext('task', 'task-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockSuggestionsEq).toHaveBeenCalledWith('user_id', mockUser.id)
    expect(mockSuggestionsEq).toHaveBeenCalledWith('entity_type', 'task')
    expect(mockSuggestionsEq).toHaveBeenCalledWith('entity_id', 'task-1')
    expect(mockSuggestionsEq).toHaveBeenCalledWith('status', 'active')
    expect(mockSuggestionsOrder).toHaveBeenCalledWith('confidence', { ascending: false })
    expect(result.current.suggestions).toHaveLength(1)
    expect(result.current.suggestions[0].title).toBe('Call the vet')
  })

  it('returns the most recent action as lastAction', async () => {
    mockHistoryResult = {
      data: [{ action_type: 'call', detail: 'Called the vet', outcome: 'success', created_at: '2024-01-02T00:00:00Z' }],
      error: null,
    }

    const { result } = renderHook(() => useEntityContext('task', 'task-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockHistoryEq).toHaveBeenCalledWith('user_id', mockUser.id)
    expect(mockHistoryEq).toHaveBeenCalledWith('entity_type', 'task')
    expect(mockHistoryEq).toHaveBeenCalledWith('entity_id', 'task-1')
    expect(mockHistoryOrder).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(mockHistoryLimit).toHaveBeenCalledWith(1)
    expect(result.current.lastAction).not.toBeNull()
    expect(result.current.lastAction?.actionType).toBe('call')
    expect(result.current.lastAction?.detail).toBe('Called the vet')
    expect(result.current.lastAction?.outcome).toBe('success')
    expect(result.current.lastAction?.createdAt).toBeInstanceOf(Date)
    expect(result.current.lastAction?.createdAt.toISOString()).toBe('2024-01-02T00:00:00.000Z')
  })

  it('returns empty state without querying when entityId is null', async () => {
    const { result } = renderHook(() => useEntityContext('task', null))

    expect(result.current.suggestions).toEqual([])
    expect(result.current.lastAction).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(mockSuggestionsEq).not.toHaveBeenCalled()
    expect(mockHistoryEq).not.toHaveBeenCalled()
  })

  it('returns empty state without querying when there is no authenticated user', async () => {
    mockUserState = null

    const { result } = renderHook(() => useEntityContext('task', 'task-1'))

    expect(result.current.suggestions).toEqual([])
    expect(result.current.lastAction).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(mockSuggestionsEq).not.toHaveBeenCalled()
    expect(mockHistoryEq).not.toHaveBeenCalled()
  })

  it('actOnSuggestion marks the row acted and logs to action_history', async () => {
    mockSuggestionsResult = { data: [suggestionRow()], error: null }

    const { result } = renderHook(() => useEntityContext('task', 'task-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.suggestions).toHaveLength(1)

    await act(async () => {
      await result.current.actOnSuggestion('s1', 'Called the vet', 'success')
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'acted',
        acted_at: expect.any(String),
        updated_at: expect.any(String),
      })
    )
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 's1')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: mockUser.id,
        entity_type: 'task',
        entity_id: 'task-1',
        action_type: 'call',
        detail: 'Called the vet',
        outcome: 'success',
      })
    )
    // Optimistic removal from active suggestions
    expect(result.current.suggestions).toHaveLength(0)
  })

  it('dismissSuggestion marks the row dismissed', async () => {
    mockSuggestionsResult = { data: [suggestionRow()], error: null }

    const { result } = renderHook(() => useEntityContext('task', 'task-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.dismissSuggestion('s1')
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'dismissed',
        dismissed_at: expect.any(String),
      })
    )
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 's1')
    expect(result.current.suggestions).toHaveLength(0)
  })
})
