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

  mockDelete.mockImplementation(() => ({
    eq: mockEq
  }))
}

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
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
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }
    }),
  },
}))

describe('useFamilyMembers', () => {
  beforeEach(() => {
    resetIdCounter()
    mockUser = createMockUser()
    mockFetchResult = []
    mockInsertResult = null
    mockUpdateResult = null
    mockError = null
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
      const member1 = createMockFamilyMember({ name: 'Iris', is_full_user: false })
      const member2 = createMockFamilyMember({ name: 'Ella', is_full_user: false })
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
