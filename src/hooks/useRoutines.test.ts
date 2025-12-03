import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRoutines } from './useRoutines'
import type { Routine, RecurrencePattern } from '@/types/actionable'

// Mock Supabase data - must be outside the mock factory
const mockSupabaseData: Routine[] = []

// Create mock functions outside the factory
const mockSelect = vi.fn()
const mockOrder = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockSingle = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: () => ({
      select: () => ({ eq: () => ({ order: () => mockOrder() }) }),
      insert: (data: unknown) => {
        mockInsert(data)
        return { select: () => ({ single: () => mockSingle() }) }
      },
      update: (data: unknown) => {
        mockUpdate(data)
        return { eq: () => mockUpdate() }
      },
      delete: () => ({ eq: () => mockDelete() }),
    }),
  },
}))

function createMockRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'routine-1',
    user_id: 'test-user-id',
    name: 'Morning Routine',
    description: null,
    default_assignee: null,
    recurrence_pattern: { type: 'daily' },
    time_of_day: '08:00',
    visibility: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useRoutines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseData.length = 0

    // Default mock implementations
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    })
    mockOrder.mockImplementation(() =>
      Promise.resolve({ data: mockSupabaseData, error: null })
    )
    mockUpdate.mockResolvedValue({ error: null })
    mockDelete.mockResolvedValue({ error: null })
  })

  describe('initial state', () => {
    it('starts with empty routines and loading state', async () => {
      const { result } = renderHook(() => useRoutines())

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.routines).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('fetches routines on mount', async () => {
      mockSupabaseData.push(createMockRoutine())

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.routines).toHaveLength(1)
      expect(result.current.routines[0].name).toBe('Morning Routine')
    })
  })

  describe('activeRoutines and referenceRoutines', () => {
    it('separates routines by visibility', async () => {
      mockSupabaseData.push(
        createMockRoutine({ id: '1', name: 'Active One', visibility: 'active' }),
        createMockRoutine({ id: '2', name: 'Reference One', visibility: 'reference' }),
        createMockRoutine({ id: '3', name: 'Active Two', visibility: 'active' })
      )

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(3)
      })

      expect(result.current.activeRoutines).toHaveLength(2)
      expect(result.current.referenceRoutines).toHaveLength(1)
      expect(result.current.referenceRoutines[0].name).toBe('Reference One')
    })
  })

  describe('getRoutinesForDate', () => {
    it('returns daily routines for any date', async () => {
      mockSupabaseData.push(
        createMockRoutine({ id: '1', name: 'Daily', recurrence_pattern: { type: 'daily' } })
      )

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(1)
      })

      const monday = new Date('2024-01-15') // A Monday
      const sunday = new Date('2024-01-21') // A Sunday

      expect(result.current.getRoutinesForDate(monday)).toHaveLength(1)
      expect(result.current.getRoutinesForDate(sunday)).toHaveLength(1)
    })

    it('returns weekly routines only on matching days', async () => {
      const weeklyPattern: RecurrencePattern = { type: 'weekly', days: ['mon', 'wed', 'fri'] }
      mockSupabaseData.push(
        createMockRoutine({ id: '1', name: 'MWF Workout', recurrence_pattern: weeklyPattern })
      )

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(1)
      })

      // Use local dates to avoid timezone issues
      const monday = new Date(2024, 0, 15, 12, 0, 0) // Jan 15, 2024 is Monday
      const tuesday = new Date(2024, 0, 16, 12, 0, 0) // Jan 16, 2024 is Tuesday
      const wednesday = new Date(2024, 0, 17, 12, 0, 0) // Jan 17, 2024 is Wednesday

      expect(result.current.getRoutinesForDate(monday)).toHaveLength(1)
      expect(result.current.getRoutinesForDate(tuesday)).toHaveLength(0)
      expect(result.current.getRoutinesForDate(wednesday)).toHaveLength(1)
    })

    it('returns monthly routines only on matching day of month', async () => {
      const monthlyPattern: RecurrencePattern = { type: 'monthly', day_of_month: 15 }
      mockSupabaseData.push(
        createMockRoutine({ id: '1', name: 'Monthly Review', recurrence_pattern: monthlyPattern })
      )

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(1)
      })

      const fifteenth = new Date(2024, 0, 15, 12, 0, 0)
      const sixteenth = new Date(2024, 0, 16, 12, 0, 0)

      expect(result.current.getRoutinesForDate(fifteenth)).toHaveLength(1)
      expect(result.current.getRoutinesForDate(sixteenth)).toHaveLength(0)
    })

    it('returns specific_days routines only on matching dates', async () => {
      const specificPattern: RecurrencePattern = {
        type: 'specific_days',
        dates: ['2024-01-15', '2024-01-20'],
      }
      mockSupabaseData.push(
        createMockRoutine({ id: '1', name: 'Special Day', recurrence_pattern: specificPattern })
      )

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(1)
      })

      const jan15 = new Date(2024, 0, 15, 12, 0, 0)
      const jan16 = new Date(2024, 0, 16, 12, 0, 0)
      const jan20 = new Date(2024, 0, 20, 12, 0, 0)

      expect(result.current.getRoutinesForDate(jan15)).toHaveLength(1)
      expect(result.current.getRoutinesForDate(jan16)).toHaveLength(0)
      expect(result.current.getRoutinesForDate(jan20)).toHaveLength(1)
    })

    it('excludes reference routines from date filtering', async () => {
      mockSupabaseData.push(
        createMockRoutine({ id: '1', name: 'Active', visibility: 'active' }),
        createMockRoutine({ id: '2', name: 'Reference', visibility: 'reference' })
      )

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(2)
      })

      const today = new Date()
      const routinesForToday = result.current.getRoutinesForDate(today)

      expect(routinesForToday).toHaveLength(1)
      expect(routinesForToday[0].name).toBe('Active')
    })
  })

  describe('addRoutine', () => {
    it('creates routine and updates local state', async () => {
      const newRoutine = createMockRoutine({ id: 'new-id', name: 'New Routine' })

      mockInsert.mockReturnThis()
      mockSelect.mockReturnThis()
      mockSingle.mockResolvedValue({ data: newRoutine, error: null })

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let createdRoutine: Routine | null = null
      await act(async () => {
        createdRoutine = await result.current.addRoutine({ name: 'New Routine' })
      })

      expect(createdRoutine).not.toBeNull()
      expect(createdRoutine!.name).toBe('New Routine')
    })

    it('trims whitespace from name', async () => {
      const newRoutine = createMockRoutine({ name: 'Trimmed Name' })
      mockSingle.mockResolvedValue({ data: newRoutine, error: null })

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addRoutine({ name: '  Trimmed Name  ' })
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Trimmed Name' })
      )
    })

    it('uses default recurrence pattern if not provided', async () => {
      const newRoutine = createMockRoutine()
      mockSingle.mockResolvedValue({ data: newRoutine, error: null })

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addRoutine({ name: 'Test' })
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence_pattern: { type: 'daily' } })
      )
    })
  })

  describe('updateRoutine', () => {
    it('updates routine and local state', async () => {
      mockSupabaseData.push(createMockRoutine({ id: '1', name: 'Original' }))

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(1)
      })

      await act(async () => {
        const success = await result.current.updateRoutine('1', { name: 'Updated' })
        expect(success).toBe(true)
      })

      expect(result.current.routines[0].name).toBe('Updated')
    })

    it('handles partial updates correctly', async () => {
      mockSupabaseData.push(createMockRoutine({ id: '1', name: 'Original', description: 'Desc' }))

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(1)
      })

      // Update only the name
      await act(async () => {
        const success = await result.current.updateRoutine('1', { name: 'New Name' })
        expect(success).toBe(true)
      })

      // Name should be updated, description preserved
      expect(result.current.routines[0].name).toBe('New Name')
      expect(result.current.routines[0].description).toBe('Desc')
    })
  })

  describe('deleteRoutine', () => {
    it('deletes routine and updates local state', async () => {
      mockSupabaseData.push(createMockRoutine({ id: '1' }))

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(1)
      })

      await act(async () => {
        const success = await result.current.deleteRoutine('1')
        expect(success).toBe(true)
      })

      expect(result.current.routines).toHaveLength(0)
    })
  })

  describe('toggleVisibility', () => {
    it('toggles from active to reference', async () => {
      mockSupabaseData.push(createMockRoutine({ id: '1', visibility: 'active' }))

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(1)
      })

      await act(async () => {
        await result.current.toggleVisibility('1')
      })

      expect(result.current.routines[0].visibility).toBe('reference')
    })

    it('toggles from reference to active', async () => {
      mockSupabaseData.push(createMockRoutine({ id: '1', visibility: 'reference' }))

      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.routines).toHaveLength(1)
      })

      await act(async () => {
        await result.current.toggleVisibility('1')
      })

      expect(result.current.routines[0].visibility).toBe('active')
    })

    it('returns false for non-existent routine', async () => {
      const { result } = renderHook(() => useRoutines())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        const success = await result.current.toggleVisibility('nonexistent')
        expect(success).toBe(false)
      })
    })
  })
})
