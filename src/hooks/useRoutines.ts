import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Routine, RecurrencePattern, RoutineVisibility, PrepFollowupTemplate } from '@/types/actionable'
import { matchesRecurrenceForDate, type LastCompletionMap } from '@/lib/routineUtils'

export interface CreateRoutineInput {
  name: string
  description?: string
  recurrence_pattern?: RecurrencePattern
  time_of_day?: string // HH:MM format
  times_per_day?: string[] // when set, routine recurs N times/day
  image_url?: string | null
  visibility?: RoutineVisibility
  default_assignee?: string | null  // Used for generating recurring instances
  assigned_to?: string | null  // Current assignment (if null, uses defaultFallbackAssignee)
  raw_input?: string | null
  prep_task_templates?: PrepFollowupTemplate[]
  followup_task_templates?: PrepFollowupTemplate[]
  context?: 'work' | 'family' | 'personal'
  project_id?: string | null
  parent_routine_id?: string | null
  step_order?: number | null
  pin_to_timeline?: boolean // always show on Today, even when "hide daily" is on
  // Fallback assignee if assigned_to is undefined (not null)
  defaultFallbackAssignee?: string
}

export interface UpdateRoutineInput {
  name?: string
  description?: string | null
  recurrence_pattern?: RecurrencePattern
  time_of_day?: string | null
  times_per_day?: string[] | null
  image_url?: string | null
  visibility?: RoutineVisibility
  paused_until?: string | null
  default_assignee?: string | null
  assigned_to?: string | null
  assigned_to_all?: string[] | null
  context?: 'work' | 'family' | 'personal' | null
  raw_input?: string | null
  show_on_timeline?: boolean
  pin_to_timeline?: boolean // always show on Today, even when "hide daily" is on
  location?: string | null
  location_place_id?: string | null
  prep_task_templates?: PrepFollowupTemplate[]
  followup_task_templates?: PrepFollowupTemplate[]
  project_id?: string | null
  parent_routine_id?: string | null
  step_order?: number | null
}

export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastCompletionByRoutine, setLastCompletionByRoutine] = useState<LastCompletionMap>(() => new Map())

  // Fetch the most recent completion date for each routine. Only required
  // for 'since_last' routines (the only type whose due-state depends on
  // last completion), but the query is cheap so we fetch unconditionally.
  const fetchLastCompletions = useCallback(async () => {
    try {
      // Pull every completed routine instance and reduce to a map of
      // routineId → most recent date. PostgREST doesn't expose GROUP BY,
      // so we sort desc by date and take the first occurrence per routine.
      const { data, error: fetchError } = await supabase
        .from('actionable_instances')
        .select('entity_id, date, updated_at')
        .eq('entity_type', 'routine')
        .eq('status', 'completed')
        .order('date', { ascending: false })

      if (fetchError) throw fetchError

      const map: LastCompletionMap = new Map()
      for (const row of (data || []) as Array<{ entity_id: string; date: string; updated_at: string }>) {
        if (map.has(row.entity_id)) continue // already have a later date
        const d = new Date(row.date)
        if (!isNaN(d.getTime())) map.set(row.entity_id, d)
      }
      setLastCompletionByRoutine(map)
    } catch (err) {
      console.error('fetchLastCompletions error:', err)
      // Non-fatal: since_last routines just fall back to "always due"
    }
  }, [])

  // Fetch all routines for the user
  const fetchRoutines = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRoutines([])
        setLoading(false)
        return
      }

      // RLS policies handle household sharing - no need to filter by user_id
      const { data, error: fetchError } = await supabase
        .from('routines')
        .select('*')
        .order('name', { ascending: true })

      if (fetchError) throw fetchError

      const routines = (data || []) as Routine[]

      // Auto-resume routines whose pause period has expired
      const now = new Date()
      const routinesToResume = routines.filter(
        r => r.paused_until && new Date(r.paused_until) <= now && r.visibility === 'reference'
      )

      if (routinesToResume.length > 0) {
        // Resume all expired routines
        for (const routine of routinesToResume) {
          await supabase
            .from('routines')
            .update({ visibility: 'active', paused_until: null })
            .eq('id', routine.id)

          // Update local state
          routine.visibility = 'active'
          routine.paused_until = null
        }
      }

      setRoutines(routines)
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
    fetchLastCompletions()
  }, [fetchRoutines, fetchLastCompletions])

  // Create a new routine
  const addRoutine = useCallback(async (input: CreateRoutineInput): Promise<Routine | null> => {
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Determine effective assigned_to: explicit value takes precedence, then fallback
      const effectiveAssignedTo = input.assigned_to !== undefined
        ? input.assigned_to
        : input.defaultFallbackAssignee ?? null

      const { data, error: insertError } = await supabase
        .from('routines')
        .insert({
          user_id: user.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          recurrence_pattern: input.recurrence_pattern || { type: 'daily' },
          time_of_day: input.time_of_day || null,
          times_per_day: input.times_per_day ?? null,
          image_url: input.image_url ?? null,
          visibility: input.visibility || 'active',
          default_assignee: input.default_assignee || null,
          assigned_to: effectiveAssignedTo,
          raw_input: input.raw_input || null,
          prep_task_templates: input.prep_task_templates || [],
          followup_task_templates: input.followup_task_templates || [],
          context: input.context || null,
          project_id: input.project_id ?? null,
          parent_routine_id: input.parent_routine_id ?? null,
          step_order: input.step_order ?? null,
          pin_to_timeline: input.pin_to_timeline ?? false,
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
      if (input.times_per_day !== undefined) updates.times_per_day = input.times_per_day
      if (input.image_url !== undefined) updates.image_url = input.image_url
      if (input.visibility !== undefined) updates.visibility = input.visibility
      if (input.default_assignee !== undefined) updates.default_assignee = input.default_assignee
      if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to
      if (input.assigned_to_all !== undefined) updates.assigned_to_all = input.assigned_to_all
      if (input.context !== undefined) updates.context = input.context
      if (input.raw_input !== undefined) updates.raw_input = input.raw_input
      if (input.show_on_timeline !== undefined) updates.show_on_timeline = input.show_on_timeline
      if (input.location !== undefined) updates.location = input.location
      if (input.location_place_id !== undefined) updates.location_place_id = input.location_place_id
      if (input.prep_task_templates !== undefined) updates.prep_task_templates = input.prep_task_templates
      if (input.followup_task_templates !== undefined) updates.followup_task_templates = input.followup_task_templates
      if (input.project_id !== undefined) updates.project_id = input.project_id
      if (input.parent_routine_id !== undefined) updates.parent_routine_id = input.parent_routine_id
      if (input.step_order !== undefined) updates.step_order = input.step_order
      if (input.pin_to_timeline !== undefined) updates.pin_to_timeline = input.pin_to_timeline

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
    return activeRoutines.filter(routine =>
      matchesRecurrenceForDate(routine, date, lastCompletionByRoutine.get(routine.id) ?? null),
    )
  }, [activeRoutines, lastCompletionByRoutine])

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
    lastCompletionByRoutine,
    refetchLastCompletions: fetchLastCompletions,
    refetch: fetchRoutines,
  }
}
