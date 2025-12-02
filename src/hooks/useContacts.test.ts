import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useContacts } from './useContacts'

// Mock user for useAuth
const mockUser = { id: 'test-user-id', email: 'test@example.com' }

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}))

// Mock Supabase
const mockSupabaseData: Array<{
  id: string
  user_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}> = []

const mockSelect = vi.fn().mockReturnThis()
const mockEq = vi.fn().mockReturnThis()
const mockOrder = vi.fn().mockImplementation(() =>
  Promise.resolve({ data: mockSupabaseData, error: null })
)
const mockInsert = vi.fn().mockReturnThis()
const mockUpdate = vi.fn().mockReturnThis()
const mockDelete = vi.fn().mockReturnThis()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      eq: mockEq,
      order: mockOrder,
      single: mockSingle,
    })),
  },
}))

describe('useContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseData.length = 0
  })

  it('starts with empty contacts and loading state', async () => {
    const { result } = renderHook(() => useContacts())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.contacts).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('fetches contacts on mount', async () => {
    mockSupabaseData.push({
      id: '1',
      user_id: 'test-user-id',
      name: 'Alice',
      phone: '555-1234',
      email: 'alice@example.com',
      notes: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    const { result } = renderHook(() => useContacts())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.contacts).toHaveLength(1)
    expect(result.current.contacts[0].name).toBe('Alice')
    expect(result.current.contacts[0].phone).toBe('555-1234')
  })

  describe('searchContacts', () => {
    it('returns all contacts when query is empty', async () => {
      mockSupabaseData.push(
        {
          id: '1',
          user_id: 'test-user-id',
          name: 'Alice',
          phone: null,
          email: null,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          user_id: 'test-user-id',
          name: 'Bob',
          phone: null,
          email: null,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }
      )

      const { result } = renderHook(() => useContacts())

      await waitFor(() => {
        expect(result.current.contacts).toHaveLength(2)
      })

      const searchResults = result.current.searchContacts('')
      expect(searchResults).toHaveLength(2)
    })

    it('filters contacts by name case-insensitively', async () => {
      mockSupabaseData.push(
        {
          id: '1',
          user_id: 'test-user-id',
          name: 'Alice Smith',
          phone: null,
          email: null,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          user_id: 'test-user-id',
          name: 'Bob Jones',
          phone: null,
          email: null,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: '3',
          user_id: 'test-user-id',
          name: 'Alice Wong',
          phone: null,
          email: null,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }
      )

      const { result } = renderHook(() => useContacts())

      await waitFor(() => {
        expect(result.current.contacts).toHaveLength(3)
      })

      const searchResults = result.current.searchContacts('alice')
      expect(searchResults).toHaveLength(2)
      expect(searchResults.every(c => c.name.toLowerCase().includes('alice'))).toBe(true)
    })

    it('returns empty array when no matches', async () => {
      mockSupabaseData.push({
        id: '1',
        user_id: 'test-user-id',
        name: 'Alice',
        phone: null,
        email: null,
        notes: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      })

      const { result } = renderHook(() => useContacts())

      await waitFor(() => {
        expect(result.current.contacts).toHaveLength(1)
      })

      const searchResults = result.current.searchContacts('xyz')
      expect(searchResults).toHaveLength(0)
    })
  })

  describe('contactsMap', () => {
    it('provides efficient lookup by ID', async () => {
      mockSupabaseData.push(
        {
          id: 'contact-1',
          user_id: 'test-user-id',
          name: 'Alice',
          phone: '555-1111',
          email: null,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'contact-2',
          user_id: 'test-user-id',
          name: 'Bob',
          phone: '555-2222',
          email: null,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }
      )

      const { result } = renderHook(() => useContacts())

      await waitFor(() => {
        expect(result.current.contacts).toHaveLength(2)
      })

      expect(result.current.contactsMap.get('contact-1')?.name).toBe('Alice')
      expect(result.current.contactsMap.get('contact-2')?.name).toBe('Bob')
      expect(result.current.contactsMap.get('nonexistent')).toBeUndefined()
    })
  })

  describe('getContactById', () => {
    it('returns contact by ID', async () => {
      mockSupabaseData.push({
        id: 'contact-1',
        user_id: 'test-user-id',
        name: 'Alice',
        phone: null,
        email: null,
        notes: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      })

      const { result } = renderHook(() => useContacts())

      await waitFor(() => {
        expect(result.current.contacts).toHaveLength(1)
      })

      const contact = result.current.getContactById('contact-1')
      expect(contact?.name).toBe('Alice')
    })

    it('returns undefined for unknown ID', async () => {
      const { result } = renderHook(() => useContacts())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const contact = result.current.getContactById('unknown')
      expect(contact).toBeUndefined()
    })
  })
})
