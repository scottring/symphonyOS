// Live, 2026-09-25: a prep task added from an event's panel sat on Today as a
// 12:00 AM timed row ("up next since 12:00 AM"). Prep is due on the event's
// day, any time — the row must say so.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

// Stable values — a fresh object per render re-runs the hook's effects forever.
const m = vi.hoisted(() => ({
  auth: { user: { id: 'u1', email: 'u@example.com' }, loading: false },
  family: { members: [], loading: false, error: null, getCurrentUserMember: () => undefined, addMember: () => {}, updateMember: () => {}, deleteMember: () => {} },
  toast: { showToast: () => {} },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => m.auth }))
vi.mock('@/hooks/useFamilyMembers', () => ({ useFamilyMembers: () => m.family }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => m.toast }))

const inserted: Record<string, unknown>[] = []
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
      insert: (data: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            inserted.push(data)
            return Promise.resolve({ data: { id: 'p1', created_at: '2026-09-25T00:00:00Z', updated_at: '2026-09-25T00:00:00Z', ...data }, error: null })
          },
        }),
      }),
    }),
  },
}))

describe('addPrepTask', () => {
  beforeEach(() => { __resetTasksCache(); inserted.length = 0 })

  it('lands on the event’s day as an any-time task, not at midnight', async () => {
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.addPrepTask('Bring forms', 'ev1', new Date(2026, 8, 25)) })
    expect(inserted[0]).toMatchObject({ linked_event_id: 'ev1', is_all_day: true })
  })
})
