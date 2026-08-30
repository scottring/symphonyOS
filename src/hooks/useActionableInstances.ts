import { useState, useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { emitInstancesChanged } from '@/lib/instancesChangedSignal'
import { applyProgressDelta, applyProgressExact } from '@/lib/wall/targetProgress'
import type {
  ActionableInstance,
  InstanceNote,
  CoverageRequest,
  EntityType,
  ActionableStatus,
} from '@/types/actionable'

// Helper to format date as YYYY-MM-DD in local timezone
function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function useActionableInstances() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get or create instance for an entity on a specific date
  const getOrCreateInstance = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<ActionableInstance | null> => {
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) throw new Error('Not authenticated')

      const dateStr = toDateString(date)

      // Try to get existing instance (RLS handles household sharing)
      const { data: existing, error: fetchError } = await supabase
        .from('actionable_instances')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('date', dateStr)
        .maybeSingle()

      if (existing && !fetchError) {
        return existing as ActionableInstance
      }

      // Create new instance
      const { data: created, error: createError } = await supabase
        .from('actionable_instances')
        .insert({
          user_id: user.id,
          entity_type: entityType,
          entity_id: entityId,
          date: dateStr,
          status: 'pending',
        })
        .select()
        .single()

      if (createError) throw createError
      return created as ActionableInstance
    } catch (err) {
      console.error('Failed to get/create instance:', err)
      return null
    }
  }, [])

  // Get instance if it exists (doesn't create)
  const getInstance = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<ActionableInstance | null> => {
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) return null

      // RLS handles household sharing
      const { data, error: fetchError } = await supabase
        .from('actionable_instances')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('date', toDateString(date))
        .maybeSingle()

      if (fetchError || !data) return null
      return data as ActionableInstance
    } catch {
      return null
    }
  }, [])

  // Get all instances for a date (for daily view)
  // This includes both:
  // 1. Instances originally scheduled for this date
  // 2. Instances that were deferred TO this date (status='deferred', deferred_to matches this date)
  const getInstancesForDate = useCallback(async (date: Date): Promise<ActionableInstance[]> => {
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) return []

      const dateStr = toDateString(date)

      // Query 1: Instances originally scheduled for this date
      const { data: originalInstances, error: fetchError } = await supabase
        .from('actionable_instances')
        .select('*')
        .eq('date', dateStr)

      if (fetchError) throw fetchError

      // Query 2: Instances with deferred_to on this date (any status)
      // This covers deferred routines still pending, plus ones already completed/skipped
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const { data: deferredInstances, error: deferredError } = await supabase
        .from('actionable_instances')
        .select('*')
        .gte('deferred_to', startOfDay.toISOString())
        .lte('deferred_to', endOfDay.toISOString())

      if (deferredError) throw deferredError

      // Combine results, avoiding duplicates (by instance id)
      const instanceMap = new Map<string, ActionableInstance>()
      for (const instance of (originalInstances || [])) {
        instanceMap.set(instance.id, instance as ActionableInstance)
      }
      for (const instance of (deferredInstances || [])) {
        // Only add if not already in the map (original date instances take precedence)
        if (!instanceMap.has(instance.id)) {
          instanceMap.set(instance.id, instance as ActionableInstance)
        }
      }

      return Array.from(instanceMap.values())
    } catch (err) {
      console.error('Failed to get instances for date:', err)
      return []
    }
  }, [])

  // ============================================================================
  // ACTIONS
  // ============================================================================

  // Find the correct instance for an entity on a date, checking deferred instances too.
  // This handles routines/events that were deferred FROM another date TO this date.
  const findInstanceForDate = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<ActionableInstance | null> => {
    // First try direct date match
    const instance = await getInstance(entityType, entityId, date)
    if (instance) return instance

    // Check for an instance deferred TO this date
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const { data } = await supabase
      .from('actionable_instances')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .gte('deferred_to', startOfDay.toISOString())
      .lte('deferred_to', endOfDay.toISOString())
      .maybeSingle()

    return (data as ActionableInstance) ?? null
  }, [getInstance])

  // Mark as done
  const markDone = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date,
    /** When the item was actually done — defaults to now. Lets "I did the 7am dose at 8:15" record honestly. */
    completedAt?: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      // Find existing instance (including deferred-to instances)
      let instance = await findInstanceForDate(entityType, entityId, date)
      // Fall back to creating a new instance if none exists
      if (!instance) {
        instance = await getOrCreateInstance(entityType, entityId, date)
      }
      if (!instance) throw new Error('Failed to get instance')

      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({
          status: 'completed' as ActionableStatus,
          completed_at: (completedAt ?? new Date()).toISOString(),
        })
        .eq('id', instance.id)

      if (updateError) throw updateError
      // No realtime on actionable_instances — announce the write so other
      // mounted views (Today schedule, detail-panel checklists) re-fetch.
      emitInstancesChanged()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark done'
      setError(message)
      console.error('markDone error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [findInstanceForDate, getOrCreateInstance])

  // Add to (or set) the day's progress toward a target routine's goal.
  // Completion is derived: progress >= target flips status to completed,
  // and an exact correction below target flips it back to pending.
  const writeProgress = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date,
    compute: (current: number | null) => ReturnType<typeof applyProgressDelta>
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)
    try {
      let instance = await findInstanceForDate(entityType, entityId, date)
      if (!instance) instance = await getOrCreateInstance(entityType, entityId, date)
      if (!instance) throw new Error('Failed to get instance')

      const p = compute(instance.progress ?? null)
      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({ progress: p.progress, status: p.status, completed_at: p.completed_at })
        .eq('id', instance.id)
      if (updateError) throw updateError
      emitInstancesChanged()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to log progress'
      setError(message)
      console.error('writeProgress error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [findInstanceForDate, getOrCreateInstance])

  const addProgress = useCallback(
    (entityType: EntityType, entityId: string, date: Date, amount: number, target: number | null) =>
      writeProgress(entityType, entityId, date, (cur) => applyProgressDelta(cur, amount, target, new Date())),
    [writeProgress]
  )

  const setProgress = useCallback(
    (entityType: EntityType, entityId: string, date: Date, value: number, target: number | null) =>
      writeProgress(entityType, entityId, date, () => applyProgressExact(value, target, new Date())),
    [writeProgress]
  )

  // Undo done (back to pending, or back to deferred if it was a deferred instance)
  const undoDone = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const instance = await findInstanceForDate(entityType, entityId, date)
      if (!instance) return true // No instance means it's already not done

      // If the instance was deferred from another date, restore to 'deferred'
      // Otherwise restore to 'pending'
      const dateStr = toDateString(date)
      const wasDeferred = instance.deferred_to && (instance.date as string) !== dateStr
      const restoreStatus: ActionableStatus = wasDeferred ? 'deferred' : 'pending'

      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({
          status: restoreStatus,
          completed_at: null,
          skipped_at: null,
        })
        .eq('id', instance.id)

      if (updateError) throw updateError
      emitInstancesChanged()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to undo'
      setError(message)
      console.error('undoDone error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [findInstanceForDate])

  // Skip (this instance only)
  const skip = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      // Find existing instance (including deferred-to instances)
      let instance = await findInstanceForDate(entityType, entityId, date)
      if (!instance) {
        instance = await getOrCreateInstance(entityType, entityId, date)
      }
      if (!instance) throw new Error('Failed to get instance')

      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({
          status: 'skipped' as ActionableStatus,
          skipped_at: new Date().toISOString(),
        })
        .eq('id', instance.id)

      if (updateError) throw updateError
      emitInstancesChanged()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to skip'
      setError(message)
      console.error('skip error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [findInstanceForDate, getOrCreateInstance])

  // Defer to a new date/time
  const defer = useCallback(async (
    entityType: EntityType,
    entityId: string,
    fromDate: Date,
    toDateTime: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const instance = await getOrCreateInstance(entityType, entityId, fromDate)
      if (!instance) throw new Error('Failed to get instance')

      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({
          status: 'deferred' as ActionableStatus,
          deferred_to: toDateTime.toISOString(),
        })
        .eq('id', instance.id)

      if (updateError) throw updateError
      emitInstancesChanged()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to defer'
      setError(message)
      console.error('defer error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [getOrCreateInstance])

  // Reschedule to a new date/time (smart - handles same-day vs different-day)
  // Also handles routines that were deferred FROM another date (finds the correct instance)
  const reschedule = useCallback(async (
    entityType: EntityType,
    entityId: string,
    fromDate: Date,
    toDateTime: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      // First try to find an existing instance for this date (read-only, no create)
      let instance = await getInstance(entityType, entityId, fromDate)

      // If no instance with date=fromDate, look for one deferred TO fromDate.
      // This handles routines that were pushed from another date to this one.
      if (!instance) {
        const startOfDay = new Date(fromDate)
        startOfDay.setHours(0, 0, 0, 0)
        const endOfDay = new Date(fromDate)
        endOfDay.setHours(23, 59, 59, 999)

        const { data } = await supabase
          .from('actionable_instances')
          .select('*')
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .eq('status', 'deferred')
          .gte('deferred_to', startOfDay.toISOString())
          .lte('deferred_to', endOfDay.toISOString())
          .maybeSingle()

        if (data) instance = data as ActionableInstance
      }

      // Still nothing — create one as fallback
      if (!instance) {
        instance = await getOrCreateInstance(entityType, entityId, fromDate)
      }

      if (!instance) throw new Error('Failed to get instance')

      // Determine if we're moving back to the instance's original date
      const toDateStr = toDateString(toDateTime)
      const originalDateStr = instance.date as string

      if (originalDateStr === toDateStr) {
        // Moving back to original date — reset to pending with time override
        const { error: updateError } = await supabase
          .from('actionable_instances')
          .update({
            status: 'pending' as ActionableStatus,
            deferred_to: toDateTime.toISOString(),
          })
          .eq('id', instance.id)

        if (updateError) throw updateError
      } else {
        // Different day - mark as deferred (hides from original date, shows on new day)
        const { error: updateError } = await supabase
          .from('actionable_instances')
          .update({
            status: 'deferred' as ActionableStatus,
            deferred_to: toDateTime.toISOString(),
          })
          .eq('id', instance.id)

        if (updateError) throw updateError
      }

      emitInstancesChanged()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reschedule'
      setError(message)
      console.error('reschedule error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [getInstance, getOrCreateInstance])

  // ============================================================================
  // NOTES
  // ============================================================================

  // Get notes for an instance
  const getNotes = useCallback(async (instanceId: string): Promise<InstanceNote[]> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('instance_notes')
        .select('*')
        .eq('instance_id', instanceId)
        .order('created_at', { ascending: true })

      if (fetchError) throw fetchError
      return (data || []) as InstanceNote[]
    } catch (err) {
      console.error('Failed to get notes:', err)
      return []
    }
  }, [])

  // Add a note
  const addNote = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date,
    note: string
  ): Promise<InstanceNote | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { user } } = await getAuthUser()
      if (!user) throw new Error('Not authenticated')

      const instance = await getOrCreateInstance(entityType, entityId, date)
      if (!instance) throw new Error('Failed to get instance')

      const { data, error: insertError } = await supabase
        .from('instance_notes')
        .insert({
          instance_id: instance.id,
          user_id: user.id,
          note: note.trim(),
        })
        .select()
        .single()

      if (insertError) throw insertError
      return data as InstanceNote
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add note'
      setError(message)
      console.error('addNote error:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [getOrCreateInstance])

  // Delete a note
  const deleteNote = useCallback(async (noteId: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('instance_notes')
        .delete()
        .eq('id', noteId)

      if (deleteError) throw deleteError
      return true
    } catch (err) {
      console.error('Failed to delete note:', err)
      return false
    }
  }, [])

  // ============================================================================
  // COVERAGE REQUESTS
  // ============================================================================

  // Request coverage
  const requestCoverage = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<CoverageRequest | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { user } } = await getAuthUser()
      if (!user) throw new Error('Not authenticated')

      const instance = await getOrCreateInstance(entityType, entityId, date)
      if (!instance) throw new Error('Failed to get instance')

      const { data, error: insertError } = await supabase
        .from('coverage_requests')
        .insert({
          instance_id: instance.id,
          requested_by: user.id,
          status: 'pending',
        })
        .select()
        .single()

      if (insertError) throw insertError
      return data as CoverageRequest
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request coverage'
      setError(message)
      console.error('requestCoverage error:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [getOrCreateInstance])

  // Get coverage requests for an instance
  const getCoverageRequests = useCallback(async (instanceId: string): Promise<CoverageRequest[]> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('coverage_requests')
        .select('*')
        .eq('instance_id', instanceId)
        .order('requested_at', { ascending: false })

      if (fetchError) throw fetchError
      return (data || []) as CoverageRequest[]
    } catch (err) {
      console.error('Failed to get coverage requests:', err)
      return []
    }
  }, [])

  // Respond to coverage request
  const respondToCoverage = useCallback(async (
    requestId: string,
    accept: boolean
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { user } } = await getAuthUser()
      if (!user) throw new Error('Not authenticated')

      const { error: updateError } = await supabase
        .from('coverage_requests')
        .update({
          status: accept ? 'accepted' : 'declined',
          covered_by: accept ? user.id : null,
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId)

      if (updateError) throw updateError

      // If accepted, also update the instance assignee
      if (accept) {
        const { data: request } = await supabase
          .from('coverage_requests')
          .select('instance_id')
          .eq('id', requestId)
          .single()

        if (request) {
          await supabase
            .from('actionable_instances')
            .update({ assignee: user.id })
            .eq('id', request.instance_id)
        }
      }

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to respond'
      setError(message)
      console.error('respondToCoverage error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    isLoading,
    error,
    // Instance operations
    getInstance,
    getOrCreateInstance,
    getInstancesForDate,
    // Actions
    markDone,
    undoDone,
    skip,
    defer,
    reschedule,
    addProgress,
    setProgress,
    // Notes
    getNotes,
    addNote,
    deleteNote,
    // Coverage
    requestCoverage,
    getCoverageRequests,
    respondToCoverage,
  }
}
