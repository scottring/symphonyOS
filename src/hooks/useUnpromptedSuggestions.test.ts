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
                // .or(unexpiredFilter(now)) — expired rows must not consume the
                // limit(50), since they sort by their peak urgency.
                or: () => ({
                  order: () => ({
                    limit: () => Promise.resolve(mockRowsResult),
                  }),
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

// A suggestion about a calendar event outlived its event: the resolver looks the
// event up in the day the view has loaded, doesn't find yesterday's, and returns
// null. The hook used to read that as "no live facts, fall back to the stored
// urgency" — the very score the engine wrote while the event was imminent. So a
// dead suggestion kept its peak score and OUTRANKED live ones into the top 3.
// Unresolvable has to mean less confidence, never maximum.
describe('useUnpromptedSuggestions — stale entity suggestions', () => {
  it('does not deliver an entity suggestion whose facts cannot be resolved', async () => {
    mockRowsResult = { data: [makeRow('gone', 80)], error: null }

    const { result } = renderHook(() =>
      useUnpromptedSuggestions('today', {
        includeCadence: false,
        resolveFacts: () => null, // the entity is not in the loaded day
      }))

    await waitFor(() => expect(result.current.decisions.length).toBeGreaterThan(0))
    expect(result.current.items).toHaveLength(0)
  })

  it('still uses the stored hint when no resolver was supplied at all', async () => {
    // Surfaces without loaded entity data (the wall) pass no resolver. They must
    // keep working off the engine's hint — the fix targets a resolver that ran
    // and came back empty, not the absence of one.
    mockRowsResult = { data: [makeRow('hint', 80)], error: null }

    const { result } = renderHook(() =>
      useUnpromptedSuggestions('today', { includeCadence: false }))

    await waitFor(() => expect(result.current.items.length).toBeGreaterThan(0))
    expect(result.current.items).toHaveLength(1)
  })

  it('drops rows whose engine-stamped expires_at has passed', async () => {
    // proactive-engine stamps expires_at = +24h on every row it writes
    // (proactive-engine/index.ts:912) and, until this fix, every client read
    // threw that column away — so nothing ever expired.
    const expired = { ...makeRow('old', 80), expires_at: '2020-01-01T00:00:00Z' }
    mockRowsResult = { data: [expired], error: null }

    const { result } = renderHook(() =>
      useUnpromptedSuggestions('today', { includeCadence: false }))

    await waitFor(() => expect(result.current.decisions).toBeDefined())
    expect(result.current.items).toHaveLength(0)
  })
})

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
