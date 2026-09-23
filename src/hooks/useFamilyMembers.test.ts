import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useFamilyMembers } from './useFamilyMembers'
import { createMockFamilyMember, createMockUser, resetIdCounter } from '@/test/mocks/factories'
import type { FamilyMember } from '@/types/family'

// Module-level state for mocking
let mockUser: ReturnType<typeof createMockUser> | null = null
let mockFetchResult: FamilyMember[] | null = []
let mockInsertResult: FamilyMember[] | null = null
let mockUpdateResult: FamilyMember | null = null
let mockError: { message: string } | null = null

// Mock functions
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()

// Reset chaining mocks with proper return values
const resetMocks = () => {
  mockSingle.mockImplementation(() =>
    Promise.resolve({ data: mockUpdateResult, error: mockError })
  )

  mockOrder.mockImplementation(() =>
    Promise.resolve({ data: mockFetchResult, error: mockError })
  )

  mockEq.mockImplementation(() => ({
    order: mockOrder,
    select: () => ({
      single: mockSingle
    }),
    then: (resolve: (val: unknown) => void) =>
      Promise.resolve({ data: null, error: mockError }).then(resolve)
  }))

  mockSelect.mockImplementation(() => ({
    eq: mockEq,
    single: mockSingle,
    order: mockOrder
  }))

  mockInsert.mockImplementation(() => ({
    select: () => ({
      single: mockSingle,
      then: (resolve: (val: unknown) => void) =>
        Promise.resolve({ data: mockInsertResult, error: mockError }).then(resolve)
    })
  }))

  mockUpdate.mockImplementation(() => ({
    eq: () => ({
      select: () => ({
        single: mockSingle
      })
    })
  }))

  // delete().eq().select() returns the deleted row — or none, which is how
  // RLS answers a DELETE it forbids (no error).
  mockDelete.mockImplementation(() => ({
    eq: (_col: string, v: string) => ({
      select: () => Promise.resolve(mockError
        ? { data: null, error: mockError }
        : { data: memberDeleteBlocked ? [] : [{ id: v }], error: null }),
    }),
  }))
}
let memberDeleteBlocked = false

// In-memory tasks: deleteMember must leave them alone (the database trigger
// clears assignments atomically), so any client write would show up here.
type TaskRow = { id: string; assigned_to: string | null; assigned_to_all: string[] | null }
let tasksTable: TaskRow[] = []
function tasksApi() {
  const query = (filter: (r: TaskRow) => boolean, patch?: Partial<TaskRow>) => {
    const run = () => {
      const rows = tasksTable.filter(filter)
      if (!patch) return { data: rows.map((r) => ({ ...r })), error: null }
      const hit = rows
      hit.forEach((r) => Object.assign(r, patch))
      return { data: hit.map((r) => ({ id: r.id })), error: null }
    }
    const q: Record<string, unknown> = {
      eq: (col: keyof TaskRow, v: unknown) => query((r) => filter(r) && r[col] === v, patch),
      in: (col: keyof TaskRow, vs: unknown[]) => query((r) => filter(r) && vs.includes(r[col]), patch),
      contains: (col: keyof TaskRow, vs: string[]) => query((r) => filter(r) && vs.every((v) => ((r[col] as string[] | null) ?? []).includes(v)), patch),
      select: () => q,
      order: () => Promise.resolve(run()),
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    }
    return q
  }
  return {
    select: () => query(() => true),
    update: (patch: Partial<TaskRow>) => query(() => true, patch),
  }
}

// Mock Supabase
vi.mock('@/lib/supabase', () => {
  const __mod: any = {
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser } })),
    },
    from: vi.fn((table: string) => {
      if (table === 'family_members') {
        return {
          select: mockSelect,
          insert: mockInsert,
          update: mockUpdate,
          delete: mockDelete,
        }
      }
      // A tiny in-memory 'tasks' table (deleteMember must not write to it).
      return tasksApi()
    }),
  },
}
  // getAuthUser is the real module's cached-session reader; here it
  // just answers from whatever this mock's auth returns.
  return {
    ...__mod,
    getAuthUser: (...a: any[]) =>
      __mod.supabase.auth?.getUser?.(...a) ??
      Promise.resolve({ data: { user: null }, error: null }),
  }
})

describe('useFamilyMembers', () => {
  beforeEach(() => {
    resetIdCounter()
    mockUser = createMockUser()
    mockFetchResult = []
    mockInsertResult = null
    mockUpdateResult = null
    mockError = null
    tasksTable = []
    memberDeleteBlocked = false
    vi.clearAllMocks()
    resetMocks()
  })

  describe('initial loading', () => {
    it('starts with loading=true', async () => {
      const { result } = renderHook(() => useFamilyMembers())
      expect(result.current.loading).toBe(true)
      // Wait for async fetch to complete to avoid act() warning
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('sets loading=false after fetch completes', async () => {
      mockFetchResult = [createMockFamilyMember()]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('loads members on mount', async () => {
      const member1 = createMockFamilyMember({ name: 'Scott', initials: 'SK' })
      const member2 = createMockFamilyMember({ name: 'Iris', initials: 'IR' })
      mockFetchResult = [member1, member2]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.members).toHaveLength(2)
      expect(result.current.members[0].name).toBe('Scott')
      expect(result.current.members[1].name).toBe('Iris')
    })

    it('returns empty array when not authenticated', async () => {
      mockUser = null

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.members).toEqual([])
    })

    it('sets error on fetch failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockError = { message: 'Database error' }
      mockOrder.mockImplementation(() =>
        Promise.resolve({ data: null, error: mockError })
      )

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeTruthy()
      consoleSpy.mockRestore()
    })
  })

  describe('auto-seeding', () => {
    it('seeds default family members when empty', async () => {
      mockFetchResult = []
      const defaultMembers = [
        createMockFamilyMember({ name: 'Scott', initials: 'SK', color: 'blue', is_full_user: true, display_order: 0 }),
        createMockFamilyMember({ name: 'Iris', initials: 'IR', color: 'purple', is_full_user: false, display_order: 1 }),
        createMockFamilyMember({ name: 'Ella', initials: 'EL', color: 'green', is_full_user: false, display_order: 2 }),
        createMockFamilyMember({ name: 'Kaleb', initials: 'KA', color: 'orange', is_full_user: false, display_order: 3 }),
      ]
      mockInsertResult = defaultMembers

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Wait for seeding effect
      await waitFor(() => {
        expect(mockInsert).toHaveBeenCalled()
      }, { timeout: 1000 })
    })

    it('seeds exactly once when many instances mount concurrently', async () => {
      // Stateful mock DB: an insert becomes visible to subsequent reads, like
      // the real thing. The old per-instance guard raced past the empty-check
      // and inserted once per mounted instance (9 duplicates on 2026-07-20).
      const db: FamilyMember[] = []
      mockOrder.mockImplementation(() => Promise.resolve({ data: [...db], error: null }))
      mockInsert.mockImplementation(() => {
        const row = createMockFamilyMember({ name: 'me', is_full_user: true })
        db.push(row)
        return {
          select: () => ({
            single: mockSingle,
            then: (resolve: (val: unknown) => void) =>
              Promise.resolve({ data: [row], error: null }).then(resolve),
          }),
        }
      })

      const hooks = [
        renderHook(() => useFamilyMembers()),
        renderHook(() => useFamilyMembers()),
        renderHook(() => useFamilyMembers()),
      ]

      await waitFor(() => {
        hooks.forEach(h => expect(h.result.current.loading).toBe(false))
      })

      // All instances adopt the single seeded row…
      await waitFor(() => {
        hooks.forEach(h => expect(h.result.current.members).toHaveLength(1))
      })
      // …from exactly one insert (this raced to 9 duplicates on 2026-07-20)
      expect(mockInsert).toHaveBeenCalledTimes(1)
    })

    it('does not seed if members already exist', async () => {
      mockFetchResult = [createMockFamilyMember()]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Give time for seeding effect to potentially run
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('does not seed if not authenticated', async () => {
      mockUser = null
      mockFetchResult = []

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Give time for seeding effect to potentially run
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockInsert).not.toHaveBeenCalled()
    })
  })

  describe('addMember', () => {
    it('adds a new family member', async () => {
      mockFetchResult = []
      const newMember = createMockFamilyMember({ name: 'New Member', initials: 'NM' })
      mockUpdateResult = newMember

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let addedMember: FamilyMember | undefined

      await act(async () => {
        addedMember = await result.current.addMember({
          name: 'New Member',
          initials: 'NM',
          color: 'blue',
          avatar_url: null,
          is_full_user: false,
          display_order: 0,
          member_type: 'core',
        })
      })

      expect(addedMember).toEqual(newMember)
      expect(mockInsert).toHaveBeenCalled()
    })

    it('throws when not authenticated', async () => {
      mockFetchResult = []

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Set user to null after initial load
      mockUser = null

      await expect(
        result.current.addMember({
          name: 'New Member',
          initials: 'NM',
          color: 'blue',
          avatar_url: null,
          is_full_user: false,
          display_order: 0,
          member_type: 'core',
        })
      ).rejects.toThrow('Not authenticated')
    })

    it('throws on database error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchResult = []
      mockError = { message: 'Insert failed' }
      mockSingle.mockImplementation(() =>
        Promise.resolve({ data: null, error: mockError })
      )

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        result.current.addMember({
          name: 'New Member',
          initials: 'NM',
          color: 'blue',
          avatar_url: null,
          is_full_user: false,
          display_order: 0,
          member_type: 'core',
        })
      ).rejects.toBeTruthy()

      consoleSpy.mockRestore()
    })
  })

  describe('updateMember', () => {
    it('updates an existing family member', async () => {
      const member = createMockFamilyMember({ name: 'Scott', initials: 'SK' })
      mockFetchResult = [member]
      const updatedMember = { ...member, name: 'Scott K', initials: 'SK' }
      mockUpdateResult = updatedMember

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1)
      })

      let updated: FamilyMember | undefined

      await act(async () => {
        updated = await result.current.updateMember(member.id, { name: 'Scott K' })
      })

      expect(updated?.name).toBe('Scott K')
      expect(mockUpdate).toHaveBeenCalled()
    })

    it('updates local state after successful update', async () => {
      const member = createMockFamilyMember({ name: 'Scott', initials: 'SK' })
      mockFetchResult = [member]
      const updatedMember = { ...member, name: 'Scott Updated' }
      mockUpdateResult = updatedMember

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1)
      })

      await act(async () => {
        await result.current.updateMember(member.id, { name: 'Scott Updated' })
      })

      expect(result.current.members[0].name).toBe('Scott Updated')
    })

    it('throws on database error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const member = createMockFamilyMember()
      mockFetchResult = [member]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1)
      })

      // Set error after initial load
      mockError = { message: 'Update failed' }
      mockSingle.mockImplementation(() =>
        Promise.resolve({ data: null, error: mockError })
      )

      await expect(
        result.current.updateMember(member.id, { name: 'New Name' })
      ).rejects.toBeTruthy()

      consoleSpy.mockRestore()
    })
  })

  describe('deleteMember', () => {
    it('deletes a family member', async () => {
      const member = createMockFamilyMember()
      mockFetchResult = [member]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1)
      })

      await act(async () => {
        await result.current.deleteMember(member.id)
      })

      expect(mockDelete).toHaveBeenCalled()
    })

    it('removes member from local state after deletion', async () => {
      const member1 = createMockFamilyMember({ name: 'Member 1' })
      const member2 = createMockFamilyMember({ name: 'Member 2' })
      mockFetchResult = [member1, member2]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(2)
      })

      await act(async () => {
        await result.current.deleteMember(member1.id)
      })

      expect(result.current.members).toHaveLength(1)
      expect(result.current.members[0].name).toBe('Member 2')
    })

    it('throws on database error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const member = createMockFamilyMember()
      mockFetchResult = [member]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1)
      })

      // Set error after initial load
      mockError = { message: 'Delete failed' }
      mockEq.mockImplementation(() =>
        Promise.resolve({ error: mockError })
      )

      await expect(
        result.current.deleteMember(member.id)
      ).rejects.toBeTruthy()

      consoleSpy.mockRestore()
    })
  })

  // Member removal is ONE delete (2026-09-23). The database trigger
  // family_members_clear_assignments clears every assignment in the same
  // statement — including private tasks this user cannot see — and rolls back
  // with a failed delete; that was verified on production in a rolled-back
  // two-account transaction (see docs/planning/2026-09-22-ux-assessment.md).
  // Here: the client makes no partial writes, and only a confirmed row counts.
  describe('deleteMember is one confirmed delete', () => {
    const setup = async () => {
      // Two members: an empty list auto-seeds the user's own row.
      const member = createMockFamilyMember({ name: 'Liam' })
      mockFetchResult = [member, createMockFamilyMember({ name: 'Mia' })]
      const hook = renderHook(() => useFamilyMembers())
      await waitFor(() => expect(hook.result.current.members).toHaveLength(2))
      return { member, ...hook }
    }

    it('deletes the member and writes nothing to tasks itself', async () => {
      const { member, result } = await setup()
      tasksTable = [{ id: 'a', assigned_to: member.id, assigned_to_all: [member.id, 'mia'] }]
      await act(async () => { await result.current.deleteMember(member.id) })
      expect(mockDelete).toHaveBeenCalled()
      expect(result.current.members.map((m) => m.name)).toEqual(['Mia'])
      // The trigger does the cleanup atomically; the client does not.
      expect(tasksTable).toEqual([{ id: 'a', assigned_to: member.id, assigned_to_all: [member.id, 'mia'] }])
    })

    // RLS answers a forbidden DELETE with zero rows and no error.
    it('a delete that removes zero rows is a failure and keeps the member', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { member, result } = await setup()
      memberDeleteBlocked = true
      await expect(result.current.deleteMember(member.id)).rejects.toMatchObject({
        message: expect.stringMatching(/couldn't be removed/), userFacing: true,
      })
      expect(result.current.members).toHaveLength(2)
      consoleSpy.mockRestore()
    })

    it('explains a delete blocked by screen-time history (FK 23503)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { member, result } = await setup()
      mockError = { message: 'violates foreign key constraint', code: '23503' } as { message: string }
      await expect(result.current.deleteMember(member.id)).rejects.toMatchObject({
        message: expect.stringMatching(/screen-time history/), userFacing: true,
      })
      expect(result.current.members).toHaveLength(2)
      consoleSpy.mockRestore()
    })

    it('passes other database errors through without calling them user-facing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { member, result } = await setup()
      mockError = { message: 'Delete failed' }
      const failure = await result.current.deleteMember(member.id).catch((e) => e)
      expect(failure).toMatchObject({ message: 'Delete failed' })
      expect(failure.userFacing).toBeUndefined()
      expect(result.current.members).toHaveLength(2)
      consoleSpy.mockRestore()
    })
  })

  describe('getMember', () => {
    it('returns member by ID', async () => {
      const member1 = createMockFamilyMember({ name: 'Scott' })
      const member2 = createMockFamilyMember({ name: 'Iris' })
      mockFetchResult = [member1, member2]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(2)
      })

      const found = result.current.getMember(member2.id)
      expect(found?.name).toBe('Iris')
    })

    it('returns undefined for null ID', async () => {
      const member = createMockFamilyMember()
      mockFetchResult = [member]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1)
      })

      expect(result.current.getMember(null)).toBeUndefined()
    })

    it('returns undefined for undefined ID', async () => {
      const member = createMockFamilyMember()
      mockFetchResult = [member]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1)
      })

      expect(result.current.getMember(undefined)).toBeUndefined()
    })

    it('returns undefined for non-existent ID', async () => {
      const member = createMockFamilyMember()
      mockFetchResult = [member]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1)
      })

      expect(result.current.getMember('non-existent-id')).toBeUndefined()
    })
  })

  describe('getCurrentUserMember', () => {
    it('returns the member marked as full user', async () => {
      const member1 = createMockFamilyMember({ name: 'Scott', is_full_user: true })
      const member2 = createMockFamilyMember({ name: 'Iris', is_full_user: false })
      mockFetchResult = [member1, member2]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(2)
      })

      const currentUser = result.current.getCurrentUserMember()
      expect(currentUser?.name).toBe('Scott')
      expect(currentUser?.is_full_user).toBe(true)
    })

    it('returns undefined if no full user exists', async () => {
      const member1 = createMockFamilyMember({ name: 'Iris', is_full_user: false, user_id: 'unrelated-user-1' })
      const member2 = createMockFamilyMember({ name: 'Ella', is_full_user: false, user_id: 'unrelated-user-2' })
      mockFetchResult = [member1, member2]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(2)
      })

      expect(result.current.getCurrentUserMember()).toBeUndefined()
    })
  })

  describe('refetch', () => {
    it('refetches members from database', async () => {
      mockFetchResult = [createMockFamilyMember({ name: 'Initial' })]

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.members).toHaveLength(1)
      })

      expect(result.current.members[0].name).toBe('Initial')

      // Update mock data
      mockFetchResult = [
        createMockFamilyMember({ name: 'Updated1' }),
        createMockFamilyMember({ name: 'Updated2' }),
      ]

      await act(async () => {
        await result.current.refetch()
      })

      expect(result.current.members).toHaveLength(2)
      expect(result.current.members[0].name).toBe('Updated1')
    })
  })

  describe('error state', () => {
    it('initializes with null error', async () => {
      mockFetchResult = []

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeNull()
    })

    it('sets error on network failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockOrder.mockImplementation(() => Promise.reject(new Error('Network error')))

      const { result } = renderHook(() => useFamilyMembers())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeTruthy()
      expect(result.current.error?.message).toBe('Network error')

      consoleSpy.mockRestore()
    })
  })
})
