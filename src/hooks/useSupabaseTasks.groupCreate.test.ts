import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSupabaseTasks, __resetTasksCache } from './useSupabaseTasks'
import { groupItems } from '@/lib/today/groupTasks'

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

interface Row {
  id: string
  user_id: string
  title: string
  completed: boolean
  bucket: string
  scheduled_for: string | null
  is_all_day: boolean | null
  parent_task_id: string | null
  group_members: unknown[]
  created_at: string
  updated_at: string
}

/** The "database": inserts and updates mutate it, so a refetch sees the truth. */
const db: Row[] = []
let nextId = 1

function row(over: Partial<Row> = {}): Row {
  return {
    id: `row-${nextId++}`,
    user_id: 'test-user-id',
    title: 'Task',
    completed: false,
    bucket: 'timed',
    scheduled_for: '2026-07-26T04:00:00.000Z',
    is_all_day: true,
    parent_task_id: null,
    group_members: [],
    created_at: `2026-07-0${nextId}T00:00:00Z`,
    updated_at: '2026-07-01T00:00:00Z',
    ...over,
  }
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = { on: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      ch.subscribe = vi.fn(() => ch)
      return ch
    }),
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: [...db], error: null }) }),
        order: () => Promise.resolve({ data: [...db], error: null }),
      }),
      insert: (data: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            const created = row(data as Partial<Row>)
            db.push(created)
            return Promise.resolve({ data: created, error: null })
          },
        }),
      }),
      update: (data: Record<string, unknown>) => {
        const apply = (target: Row) => Object.assign(target, data)
        return {
          eq: (_f: string, value: string) => {
            const hit = db.find((r) => r.id === value)
            if (hit) apply(hit)
            return { select: () => Promise.resolve({ data: hit ? [hit] : [], error: null }) }
          },
          in: (_f: string, values: string[]) => {
            for (const r of db) if (values.includes(r.id)) apply(r)
            return Promise.resolve({ error: null })
          },
        }
      },
    }),
  },
}))

describe('groupItems — every member survives the write', () => {
  beforeEach(() => {
    __resetTasksCache()
    vi.clearAllMocks()
    db.length = 0
    nextId = 1
  })

  it('keeps BOTH tasks under the new wrapper', async () => {
    // Reported from real use: after a drag created a group, the items inside it
    // vanished until the page was refreshed. Reparenting the second child
    // re-ran nestSubtasks on a half-nested list, which rebuilt the wrapper's
    // subtasks from the top level only — discarding the first child.
    db.push(row({ id: 'a', title: "here's a task" }), row({ id: 'b', title: "here's another" }))

    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tasks).toHaveLength(2)

    await act(async () => {
      await groupItems(
        {
          taskIds: ['a', 'b'],
          memberRefs: [],
          groupName: 'New Group',
          date: new Date(2026, 6, 26),
          isAllDay: true,
        },
        {
          addTask: result.current.addTask,
          updateTask: result.current.updateTask,
          refetch: result.current.refetch,
        },
      )
    })

    const wrapper = result.current.tasks.find((t) => t.title === 'New Group')
    expect(wrapper).toBeDefined()
    expect(wrapper!.subtasks?.map((s) => s.id).sort()).toEqual(['a', 'b'])
    // And neither child is stranded at the top level.
    expect(result.current.tasks.map((t) => t.id)).toEqual([wrapper!.id])
  })

  it('keeps the first child when the second is reparented, BEFORE any refetch', async () => {
    // The window the user actually sees. Reparenting child two re-nests a list
    // where child one is already nested — and nestSubtasks rebuilds a parent's
    // subtasks from the top level only, so child one is dropped from state
    // entirely until a refetch puts it back.
    db.push(
      row({ id: 'w', title: 'New Group' }),
      row({ id: 'a', title: "here's a task" }),
      row({ id: 'b', title: "here's another" }),
    )

    const { result } = renderHook(() => useSupabaseTasks())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateTask('a', { parentTaskId: 'w' })
    })
    await act(async () => {
      await result.current.updateTask('b', { parentTaskId: 'w' })
    })

    const wrapper = result.current.tasks.find((t) => t.id === 'w')
    expect(wrapper!.subtasks?.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })
})
