import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'

// One enduring action (2026-09-21). Placing a month/season row LOWER used to
// copy it (source_id) — and re-placing it copied it again: ten identical
// "Maybe plan a block potluck on the porch" tasks landed inside twenty seconds
// on 2026-09-10, each carrying its own twin of the note. Now there is one row
// for the whole life of the task: a placement is a commitment record or a
// day on that row, and re-placing it rewrites the same row.

const mockUser = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }))
vi.mock('@/hooks/useFamilyMembers', () => ({
  useFamilyMembers: () => ({
    members: [], loading: false, error: null,
    getCurrentUserMember: () => undefined,
    addMember: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn(),
  }),
}))
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  showToast: vi.fn(),
}))

const mockSupabaseData: Record<string, unknown>[] = []
const inserts: Record<string, unknown>[] = []
const rowWrites: Array<{ id: string; data: Record<string, unknown> }> = []
const recordWrites: Array<{ table: string; op: string; data: Record<string, unknown> }> = []

function dbTask(over: Record<string, unknown> = {}) {
  return {
    id: 'month-row',
    user_id: 'test-user-id',
    title: 'Maybe plan a block potluck on the porch',
    completed: false,
    bucket: 'month',
    month_start: '2026-09-01',
    scheduled_for: null,
    is_all_day: false,
    parent_task_id: null,
    context: 'family',
    scope: 'compound',
    assigned_to: null,
    source_id: null,
    notes: 'From the Aug 2026 family planning session.',
    created_at: '2026-08-06T09:22:15Z',
    updated_at: '2026-08-06T09:22:15Z',
    ...over,
  }
}

function recordsStub(table: string) {
  const chain = (op: string) => (data: Record<string, unknown> = {}) => {
    recordWrites.push({ table, op, data })
    const c: Record<string, unknown> = {}
    c.eq = () => c
    c.then = (resolve: (v: { error: null }) => unknown) => resolve({ error: null })
    return c
  }
  return { select: () => Promise.resolve({ data: [], error: null }), upsert: chain('upsert'), update: chain('update'), delete: chain('delete') }
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: (table: string) => table !== 'tasks' ? recordsStub(table) : ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: mockSupabaseData, error: null }) }),
        order: () => Promise.resolve({ data: mockSupabaseData, error: null }),
      }),
      insert: (data: Record<string, unknown>) => {
        inserts.push(data)
        return {
          select: () => ({
            single: () => Promise.resolve({
              data: dbTask({ ...data, id: `copy-${inserts.length}` }),
              error: null,
            }),
          }),
        }
      },
      update: (data: Record<string, unknown>) => ({
        eq: (_field: string, value: string) => {
          rowWrites.push({ id: value, data })
          return { select: () => Promise.resolve({ data: [dbTask({ id: value })], error: null }) }
        },
        in: () => Promise.resolve({ error: null }),
      }),
    }),
  },
}))

describe('a month row is placed lower and re-placed on the SAME row', () => {
  beforeEach(() => {
    __resetTasksCache()
    vi.clearAllMocks()
    mockSupabaseData.length = 0
    inserts.length = 0
    rowWrites.length = 0
    recordWrites.length = 0
  })

  it('the first placement writes the row itself: a week commitment added, the month kept, nothing inserted', async () => {
    mockSupabaseData.push(dbTask())
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))

    await act(() => result.current.updateTask('month-row', { bucket: 'week', weekStart: new Date(2026, 8, 13) }))

    expect(inserts).toHaveLength(0)
    const write = rowWrites.find((w) => w.id === 'month-row')
    expect(write?.data).toMatchObject({ bucket: 'week', week_start: '2026-09-13', month_start: '2026-09-01' })
    expect(recordWrites).toContainEqual(expect.objectContaining({ table: 'task_commitments', op: 'upsert', data: expect.objectContaining({ level: 'week', period_start: '2026-09-13' }) }))
    expect(result.current.tasks).toHaveLength(1)
    expect(result.current.tasks[0].commitments?.map((c) => [c.level, c.status])).toEqual([['month', 'open'], ['week', 'open']])
  })

  it('placing it again onto a day rewrites the same row — no twin, no note copied', async () => {
    mockSupabaseData.push(dbTask())
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(1))

    await act(() => result.current.updateTask('month-row', { bucket: 'week', weekStart: new Date(2026, 8, 13) }))
    await act(() => result.current.updateTask('month-row', { bucket: 'timed', scheduledFor: new Date(2026, 8, 12) }))

    expect(inserts).toHaveLength(0)
    const moved = rowWrites.at(-1)!
    expect(moved.id).toBe('month-row')
    expect(moved.data).toMatchObject({ bucket: 'timed', month_start: '2026-09-01' })
    expect(result.current.tasks).toHaveLength(1)
    expect(result.current.tasks[0].notes).toBe('From the Aug 2026 family planning session.')
  })

  it('an old-world finished twin (source_id) is just another row; the placement still targets the row asked for', async () => {
    mockSupabaseData.push(
      dbTask(),
      dbTask({ id: 'done-copy', bucket: 'week', source_id: 'month-row', completed: true, created_at: '2026-09-01T10:00:00Z' }),
    )
    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.tasks).toHaveLength(2))

    await act(() => result.current.updateTask('month-row', { bucket: 'week', weekStart: new Date(2026, 8, 20) }))

    expect(inserts).toHaveLength(0)
    expect(rowWrites.map((w) => w.id)).toEqual(['month-row'])
    expect(result.current.tasks).toHaveLength(2)
  })
})
