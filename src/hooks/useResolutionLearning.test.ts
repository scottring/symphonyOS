// src/hooks/useResolutionLearning.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { selectMock, insertMock, rpcMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn().mockResolvedValue({ error: null }),
  rpcMock: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => table === 'entity_aliases'
      ? { select: selectMock }
      : { insert: insertMock }),
    rpc: rpcMock,
  },
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))

import { useResolutionLearning } from './useResolutionLearning'
import type { ContactSuggestion } from '@/lib/entityResolver'

const fuzzySuggestion: ContactSuggestion = {
  contactId: 'c1', contactName: 'Macmillan Guitars', phone: '410-555-0142',
  matchedText: 'macmilan guitars', score: 0.82, tier: 'fuzzy', band: 'ghost', callIntent: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  selectMock.mockResolvedValue({ data: [
    { alias_normalized: 'the guitar place', entity_type: 'contact', entity_id: 'c1' },
  ], error: null })
  insertMock.mockResolvedValue({ error: null })
  rpcMock.mockResolvedValue({ error: null })
})

describe('useResolutionLearning', () => {
  it('loads aliases mapped to camelCase', async () => {
    const { result } = renderHook(() => useResolutionLearning())
    await waitFor(() => expect(result.current.aliases).toHaveLength(1))
    expect(result.current.aliases[0]).toEqual({
      aliasNormalized: 'the guitar place', entityType: 'contact', entityId: 'c1',
    })
  })

  it('accepted fuzzy outcome: logs + upserts alias + adds local alias', async () => {
    const { result } = renderHook(() => useResolutionLearning())
    await waitFor(() => expect(result.current.aliases).toHaveLength(1))
    act(() => result.current.recordOutcome({
      inputText: 'call macmilan guitars', suggestion: fuzzySuggestion, action: 'accepted', taskId: 't1',
    }))
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1', input_text: 'call macmilan guitars', action: 'accepted',
      suggested_entity_id: 'c1', tier: 'fuzzy', task_id: 't1',
    }))
    expect(rpcMock).toHaveBeenCalledWith('upsert_entity_alias', {
      p_alias: 'macmilan guitars', p_entity_type: 'contact', p_entity_id: 'c1', p_source: 'accepted',
    })
    expect(result.current.aliases).toHaveLength(2)
  })

  it('containment outcome logs but never creates an alias', async () => {
    const { result } = renderHook(() => useResolutionLearning())
    await waitFor(() => expect(result.current.aliases).toHaveLength(1))
    act(() => result.current.recordOutcome({
      inputText: 'call macmillan guitars',
      suggestion: { ...fuzzySuggestion, tier: 'containment', matchedText: 'macmillan guitars', score: 0.95, band: 'apply' },
      action: 'auto_applied',
    }))
    expect(insertMock).toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('dismissed outcome logs only', async () => {
    const { result } = renderHook(() => useResolutionLearning())
    await waitFor(() => expect(result.current.aliases).toHaveLength(1))
    act(() => result.current.recordOutcome({
      inputText: 'call macmilan guitars', suggestion: fuzzySuggestion, action: 'dismissed',
    }))
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'dismissed' }))
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
