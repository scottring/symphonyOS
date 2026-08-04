import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useUnpromptedSuggestions } from './useUnpromptedSuggestions'
import { SURFACES } from '@/lib/assistant/interruptionPolicy'
import type { ProactiveSuggestionRow } from '@/types/proactiveSuggestion'
import { createMockUser } from '@/test/mocks/factories'

// Mock useAuth (convention from useEntityContext.test.ts)
const mockUser = createMockUser()
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

// Chainable mock matching the exact query shape the hook issues for
// proactive_suggestions: select('*').eq(user_id).eq(status).order(urgency).limit(50)
let mockRowsResult: { data: ProactiveSuggestionRow[]; error: null } = { data: [], error: null }
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'proactive_suggestions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => Promise.resolve(mockRowsResult),
                }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table in test: ${table}`)
    },
  },
}))

/** A well-formed, high-urgency, actionable, unsnoozed row that clears every
 *  gate in mayInterrupt for the 'today' surface (urgencyFloor 55, non-critical
 *  since it's under CRITICAL_URGENCY=90). */
function makeRow(id: string, urgency: number): ProactiveSuggestionRow {
  return {
    id, user_id: mockUser.id, entity_type: 'task', entity_id: `t-${id}`,
    suggestion_type: 'call', title: `Suggestion ${id}`, detail: null,
    confidence: 0.9, action_type: 'call', action_payload: { phoneNumber: '555' },
    status: 'active', acted_at: null, dismissed_at: null, expires_at: null,
    suggestion_key: `task:t-${id}:call`, generated_at: '2026-08-04T06:00:00Z',
    created_at: '2026-08-04T06:00:00Z', updated_at: '2026-08-04T06:00:00Z',
    urgency, seen_at: null, seen_urgency: null, snoozed_until: null,
  }
}

describe('useUnpromptedSuggestions — Today proposal cap', () => {
  // This pins a value this hook does not own. `items.length` for the
  // 'today' surface is bounded by SURFACES.today.concurrent
  // (src/lib/assistant/interruptionPolicy.ts), not by anything in this file —
  // that field belongs to the interruption policy, whose job is managing
  // interruption pressure, not Today's space budget. But Today's whole
  // "non-commitment space does not grow with backlog" invariant currently
  // rests on that borrowed value. Nothing else in the Today code pins it. If
  // someone raises `concurrent` for a good interruption-policy reason, this
  // test must go red so they learn, at that moment, that Today's proposal
  // list depends on it too — not months later when Today grows another
  // unbounded section.
  it('renders at most SURFACES.today.concurrent proposals however many score well', async () => {
    // 5 qualifying suggestions, all well above the 'today' urgency floor (55)
    // and all below CRITICAL_URGENCY (90) so none bypass the concurrent cap.
    mockRowsResult = {
      data: [
        makeRow('a', 80), makeRow('b', 79), makeRow('c', 78),
        makeRow('d', 77), makeRow('e', 76),
      ],
      error: null,
    }

    const { result } = renderHook(() =>
      useUnpromptedSuggestions('today', { includeCadence: false }))

    await waitFor(() => expect(result.current.items.length).toBeGreaterThan(0))

    // Hard-coded 3, not SURFACES.today.concurrent — asserting against the
    // constant under test would make this test follow any future bump
    // instead of catching it.
    expect(result.current.items).toHaveLength(3)
    expect(SURFACES.today.concurrent).toBe(3)
  })
})
