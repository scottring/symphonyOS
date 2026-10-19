import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

const mockUser = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [], loading: false, error: null,
    getCurrentUserMember: () => undefined,
    addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn(),
  }),
}))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

const db = vi.hoisted(() => ({ asked: [] as string[], releaseTasks: null as null | (() => void) }))

const row = {
  id: 'a', user_id: 'test-user-id', title: 'One', completed: false, bucket: 'timed',
  scheduled_for: null, is_all_day: null, parent_task_id: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: (table: string) => ({
      select: () => {
        if (table === 'tasks') {
          return {
            order: () => {
              db.asked.push('tasks')
              return new Promise((resolve) => { db.releaseTasks = () => resolve({ data: [row], error: null }) })
            },
          }
        }
        db.asked.push(table)
        return Promise.resolve({ data: [], error: null })
      },
    }),
  },
}))

describe('useSupabaseTasks — the records ride with the rows', () => {
  beforeEach(() => { __resetTasksCache(); db.asked = []; db.releaseTasks = null })

  it('asks for commitments and focus before the task rows have answered', async () => {
    // They used to wait for the rows: a second trip on every page's critical path.
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(db.asked).toContain('tasks'))
    expect(db.asked).toEqual(expect.arrayContaining(['task_commitments', 'task_focus']))
    await act(async () => { db.releaseTasks?.() })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tasks).toHaveLength(1)
  })
})
