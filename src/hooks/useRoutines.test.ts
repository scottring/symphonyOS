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
      select: () => ({
        eq: () => ({ order: () => mockOrder() }),
        order: () => mockOrder()
      }),
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
    assigned_to: null,
    assigned_to_all: null,
    recurrence_pattern: { type: 'daily' },
    time_of_day: '08:00',
    raw_input: null,
    visibility: 'active',
    paused_until: null,
    show_on_timeline: true,
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

    describe('interval-based daily patterns', () => {
      it('returns daily with interval=2 on matching days only', async () => {
        // Start date: Jan 1, 2024 (Monday)
        const pattern: RecurrencePattern = {
          type: 'daily',
          interval: 2,
          start_date: '2024-01-01',
        }
        mockSupabaseData.push(
          createMockRoutine({ id: '1', name: 'Every Other Day', recurrence_pattern: pattern })
        )

        const { result } = renderHook(() => useRoutines())

        await waitFor(() => {
          expect(result.current.routines).toHaveLength(1)
        })

        // Should match: Jan 1, Jan 3, Jan 5, Jan 7...
        const jan1 = new Date(2024, 0, 1, 12, 0, 0)
        const jan2 = new Date(2024, 0, 2, 12, 0, 0)
        const jan3 = new Date(2024, 0, 3, 12, 0, 0)
        const jan4 = new Date(2024, 0, 4, 12, 0, 0)
        const jan5 = new Date(2024, 0, 5, 12, 0, 0)

        expect(result.current.getRoutinesForDate(jan1)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(jan2)).toHaveLength(0)
        expect(result.current.getRoutinesForDate(jan3)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(jan4)).toHaveLength(0)
        expect(result.current.getRoutinesForDate(jan5)).toHaveLength(1)
      })

      it('does not match dates before start_date', async () => {
        const pattern: RecurrencePattern = {
          type: 'daily',
          interval: 2,
          start_date: '2024-01-15',
        }
        mockSupabaseData.push(
          createMockRoutine({ id: '1', name: 'Every Other Day', recurrence_pattern: pattern })
        )

        const { result } = renderHook(() => useRoutines())

        await waitFor(() => {
          expect(result.current.routines).toHaveLength(1)
        })

        const jan10 = new Date(2024, 0, 10, 12, 0, 0)
        expect(result.current.getRoutinesForDate(jan10)).toHaveLength(0)
      })
    })

    describe('biweekly patterns', () => {
      it('returns biweekly routines on matching weeks', async () => {
        // Start date: Jan 1, 2024 (Monday), every 2 weeks on Monday
        const pattern: RecurrencePattern = {
          type: 'weekly',
          days: ['mon'],
          interval: 2,
          start_date: '2024-01-01',
        }
        mockSupabaseData.push(
          createMockRoutine({ id: '1', name: 'Biweekly Monday', recurrence_pattern: pattern })
        )

        const { result } = renderHook(() => useRoutines())

        await waitFor(() => {
          expect(result.current.routines).toHaveLength(1)
        })

        // Should match: Jan 1, Jan 15, Jan 29...
        // Should NOT match: Jan 8, Jan 22...
        const jan1 = new Date(2024, 0, 1, 12, 0, 0) // Monday week 0
        const jan8 = new Date(2024, 0, 8, 12, 0, 0) // Monday week 1
        const jan15 = new Date(2024, 0, 15, 12, 0, 0) // Monday week 2
        const jan22 = new Date(2024, 0, 22, 12, 0, 0) // Monday week 3
        const jan29 = new Date(2024, 0, 29, 12, 0, 0) // Monday week 4

        expect(result.current.getRoutinesForDate(jan1)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(jan8)).toHaveLength(0)
        expect(result.current.getRoutinesForDate(jan15)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(jan22)).toHaveLength(0)
        expect(result.current.getRoutinesForDate(jan29)).toHaveLength(1)
      })

      it('does not match non-scheduled day of week', async () => {
        const pattern: RecurrencePattern = {
          type: 'weekly',
          days: ['mon'],
          interval: 2,
          start_date: '2024-01-01',
        }
        mockSupabaseData.push(
          createMockRoutine({ id: '1', name: 'Biweekly Monday', recurrence_pattern: pattern })
        )

        const { result } = renderHook(() => useRoutines())

        await waitFor(() => {
          expect(result.current.routines).toHaveLength(1)
        })

        // Tuesday in the matching week should not match
        const jan2 = new Date(2024, 0, 2, 12, 0, 0) // Tuesday
        expect(result.current.getRoutinesForDate(jan2)).toHaveLength(0)
      })
    })

    describe('quarterly patterns', () => {
      it('returns quarterly routines in quarter months only', async () => {
        const pattern: RecurrencePattern = {
          type: 'quarterly',
          day_of_month: 1,
        }
        mockSupabaseData.push(
          createMockRoutine({ id: '1', name: 'Quarterly Review', recurrence_pattern: pattern })
        )

        const { result } = renderHook(() => useRoutines())

        await waitFor(() => {
          expect(result.current.routines).toHaveLength(1)
        })

        // Should match: Jan 1, Apr 1, Jul 1, Oct 1
        const jan1 = new Date(2024, 0, 1, 12, 0, 0)
        const feb1 = new Date(2024, 1, 1, 12, 0, 0)
        const apr1 = new Date(2024, 3, 1, 12, 0, 0)
        const jul1 = new Date(2024, 6, 1, 12, 0, 0)
        const oct1 = new Date(2024, 9, 1, 12, 0, 0)
        const nov1 = new Date(2024, 10, 1, 12, 0, 0)

        expect(result.current.getRoutinesForDate(jan1)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(feb1)).toHaveLength(0)
        expect(result.current.getRoutinesForDate(apr1)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(jul1)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(oct1)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(nov1)).toHaveLength(0)
      })

      it('matches correct day of month for quarterly', async () => {
        const pattern: RecurrencePattern = {
          type: 'quarterly',
          day_of_month: 15,
        }
        mockSupabaseData.push(
          createMockRoutine({ id: '1', name: 'Quarterly on 15th', recurrence_pattern: pattern })
        )

        const { result } = renderHook(() => useRoutines())

        await waitFor(() => {
          expect(result.current.routines).toHaveLength(1)
        })

        const jan1 = new Date(2024, 0, 1, 12, 0, 0)
        const jan15 = new Date(2024, 0, 15, 12, 0, 0)
        const apr15 = new Date(2024, 3, 15, 12, 0, 0)

        expect(result.current.getRoutinesForDate(jan1)).toHaveLength(0)
        expect(result.current.getRoutinesForDate(jan15)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(apr15)).toHaveLength(1)
      })
    })

    describe('yearly patterns', () => {
      it('returns yearly routines on matching date only', async () => {
        const pattern: RecurrencePattern = {
          type: 'yearly',
          month_of_year: 3, // March
          day_of_month: 15,
        }
        mockSupabaseData.push(
          createMockRoutine({ id: '1', name: 'Annual Review', recurrence_pattern: pattern })
        )

        const { result } = renderHook(() => useRoutines())

        await waitFor(() => {
          expect(result.current.routines).toHaveLength(1)
        })

        const mar15_2024 = new Date(2024, 2, 15, 12, 0, 0)
        const mar16_2024 = new Date(2024, 2, 16, 12, 0, 0)
        const jan15_2024 = new Date(2024, 0, 15, 12, 0, 0)
        const mar15_2025 = new Date(2025, 2, 15, 12, 0, 0)

        expect(result.current.getRoutinesForDate(mar15_2024)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(mar16_2024)).toHaveLength(0)
        expect(result.current.getRoutinesForDate(jan15_2024)).toHaveLength(0)
        expect(result.current.getRoutinesForDate(mar15_2025)).toHaveLength(1)
      })

      it('defaults to January 1st when no month/day specified', async () => {
        const pattern: RecurrencePattern = {
          type: 'yearly',
        }
        mockSupabaseData.push(
          createMockRoutine({ id: '1', name: 'Yearly Default', recurrence_pattern: pattern })
        )

        const { result } = renderHook(() => useRoutines())

        await waitFor(() => {
          expect(result.current.routines).toHaveLength(1)
        })

        const jan1 = new Date(2024, 0, 1, 12, 0, 0)
        const jan2 = new Date(2024, 0, 2, 12, 0, 0)

        expect(result.current.getRoutinesForDate(jan1)).toHaveLength(1)
        expect(result.current.getRoutinesForDate(jan2)).toHaveLength(0)
      })
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
