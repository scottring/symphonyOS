import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Routine, RecurrencePattern, RoutineVisibility } from '@/types/actionable'

export interface CreateRoutineInput {
  name: string
  description?: string
  recurrence_pattern?: RecurrencePattern
  time_of_day?: string // HH:MM format
  visibility?: RoutineVisibility
  default_assignee?: string | null
  raw_input?: string | null
}

export interface UpdateRoutineInput {
  name?: string
  description?: string | null
  recurrence_pattern?: RecurrencePattern
  time_of_day?: string | null
  visibility?: RoutineVisibility
  default_assignee?: string | null
  assigned_to?: string | null
  raw_input?: string | null
  show_on_timeline?: boolean
}

export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch all routines for the user
  const fetchRoutines = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRoutines([])
        setLoading(false)
        return
      }

      const { data, error: fetchError } = await supabase
        .from('routines')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true })

      if (fetchError) throw fetchError
      setRoutines((data || []) as Routine[])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch routines'
      setError(message)
      console.error('fetchRoutines error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchRoutines()
  }, [fetchRoutines])

  // Create a new routine
  const addRoutine = useCallback(async (input: CreateRoutineInput): Promise<Routine | null> => {
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error: insertError } = await supabase
        .from('routines')
        .insert({
          user_id: user.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          recurrence_pattern: input.recurrence_pattern || { type: 'daily' },
          time_of_day: input.time_of_day || null,
          visibility: input.visibility || 'active',
          default_assignee: input.default_assignee || null,
          raw_input: input.raw_input || null,
        })
        .select()
        .single()

      if (insertError) throw insertError

      const routine = data as Routine
      setRoutines(prev => [...prev, routine].sort((a, b) => a.name.localeCompare(b.name)))
      return routine
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create routine'
      setError(message)
      console.error('addRoutine error:', err)
      return null
    }
  }, [])

  // Update an existing routine
  const updateRoutine = useCallback(async (id: string, input: UpdateRoutineInput): Promise<boolean> => {
    setError(null)

    try {
      const updates: Record<string, unknown> = {}
      if (input.name !== undefined) updates.name = input.name.trim()
      if (input.description !== undefined) updates.description = input.description?.trim() || null
      if (input.recurrence_pattern !== undefined) updates.recurrence_pattern = input.recurrence_pattern
      if (input.time_of_day !== undefined) updates.time_of_day = input.time_of_day
      if (input.visibility !== undefined) updates.visibility = input.visibility
      if (input.default_assignee !== undefined) updates.default_assignee = input.default_assignee
      if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to
      if (input.raw_input !== undefined) updates.raw_input = input.raw_input
      if (input.show_on_timeline !== undefined) updates.show_on_timeline = input.show_on_timeline

      const { error: updateError } = await supabase
        .from('routines')
        .update(updates)
        .eq('id', id)

      if (updateError) throw updateError

      setRoutines(prev =>
        prev
          .map(r => (r.id === id ? { ...r, ...updates } as Routine : r))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update routine'
      setError(message)
      console.error('updateRoutine error:', err)
      return false
    }
  }, [])

  // Delete a routine
  const deleteRoutine = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const { error: deleteError } = await supabase
        .from('routines')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      setRoutines(prev => prev.filter(r => r.id !== id))
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete routine'
      setError(message)
      console.error('deleteRoutine error:', err)
      return false
    }
  }, [])

  // Toggle visibility (active <-> reference)
  const toggleVisibility = useCallback(async (id: string): Promise<boolean> => {
    const routine = routines.find(r => r.id === id)
    if (!routine) return false

    const newVisibility: RoutineVisibility = routine.visibility === 'active' ? 'reference' : 'active'
    return updateRoutine(id, { visibility: newVisibility })
  }, [routines, updateRoutine])

  // Get active routines only
  const activeRoutines = routines.filter(r => r.visibility === 'active')

  // Get reference routines only
  const referenceRoutines = routines.filter(r => r.visibility === 'reference')

  // Get routines scheduled for a specific date
  const getRoutinesForDate = useCallback((date: Date): Routine[] => {
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()]
    const dayOfMonth = date.getDate()
    const dateStr = formatDateString(date)

    return activeRoutines.filter(routine => {
      const pattern = routine.recurrence_pattern

      switch (pattern.type) {
        case 'daily':
          return true
        case 'weekly':
          return pattern.days?.includes(dayOfWeek) ?? false
        case 'monthly':
          return pattern.day_of_month === dayOfMonth
        case 'specific_days':
          return pattern.dates?.includes(dateStr) ?? false
        default:
          return false
      }
    })
  }, [activeRoutines])

  return {
    routines,
    activeRoutines,
    referenceRoutines,
    loading,
    error,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    toggleVisibility,
    getRoutinesForDate,
    refetch: fetchRoutines,
  }
}

// Helper to format date as YYYY-MM-DD
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
