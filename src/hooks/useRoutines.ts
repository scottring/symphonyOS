import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import type { Routine, RecurrencePattern, RoutineVisibility, PrepFollowupTemplate } from '@/types/actionable'
import { matchesRecurrenceForDate, type LastCompletionMap } from '@/lib/routineUtils'
import { scopeForDomain, memberForAuthUser } from '@/lib/scope'
import { onRealtimeResumed } from '@/lib/realtime/keepAlive'

// ── Same-tab sync ────────────────────────────────────────────────────────────
//
// Every useRoutines() call is its own instance with its own `routines` state —
// the detail panel, HomeViewContainer, ShellSearch, the horizons pages and more
// each mount one. A mutation updated ONLY the instance that made it, and until
// now there was no second path: this hook never subscribed to realtime at all,
// and nothing anywhere in the app subscribed to the `routines` table. So
// renaming a routine in the detail pane genuinely could not reach Today. There
// was no lag to wait out; a reload was the only way.
//
// Both halves are added below. This bus is what makes the rename land instantly
// in the same tab; the realtime subscription covers other tabs and devices.
// Exactly the shape useSupabaseTasks already uses — see localTaskWrites there.

type LocalRoutineWrite =
  | { kind: 'upsert'; routine: Routine }
  | { kind: 'patch'; id: string; updates: Partial<Routine> }
  | { kind: 'delete'; id: string }

const localRoutineWrites = new EventTarget()

function announceRoutineWrite(detail: LocalRoutineWrite) {
  localRoutineWrites.dispatchEvent(new CustomEvent('write', { detail }))
}

/** Monotonic suffix so every hook instance gets its own realtime channel topic. */
let routinesChannelSeq = 0

const byName = (a: Routine, b: Routine) => a.name.localeCompare(b.name)

/**
 * The current user's FAMILY-MEMBER id — what `assigned_to` holds, and what
 * scopeForDomain needs so that "assigned to yourself" is not read as a share.
 *
 * This hook has no family-member context of its own (callers hand it a
 * `defaultFallbackAssignee`), and mounting useFamilyMembers here would give
 * every consumer a second members fetch. Resolve it once per user instead.
 *
 * KEYED BY AUTH USER, like tasksCache in useSupabaseTasks. Module state keyed
 * by nothing survives a sign-out/sign-in in the same tab: the next user would
 * derive scopes against the PREVIOUS member's id, so a routine B assigns to A
 * reads as "assigned to myself" and lands 'individual' — invisible to A. The
 * whole point of this resolver is the self-exclusion, so it has to know whose
 * self it is.
 *
 * A null answer costs the self-exclusion only — an item assigned to yourself
 * would then be written 'couple', which shares more than it must but never
 * less — so a failure is never cached.
 */
type MemberRow = { id: string; user_id: string | null; auth_user_id: string | null }

let memberRowsCache: { userId: string; rows: MemberRow[] } | null = null
let memberRowsInFlight: { userId: string; promise: Promise<MemberRow[] | null> } | null = null

/** The household as the signed-in user can read it, fetched at most once. */
async function householdMembers(): Promise<{ authUserId: string; rows: MemberRow[] } | null> {
  const { data: { user } } = await getAuthUser().catch(() => ({ data: { user: null } }))
  if (!user) return null
  if (memberRowsCache?.userId === user.id) return { authUserId: user.id, rows: memberRowsCache.rows }
  // A different user than the cache holds: drop it rather than answer stale.
  if (memberRowsCache && memberRowsCache.userId !== user.id) memberRowsCache = null

  if (memberRowsInFlight?.userId !== user.id) {
    const promise = (async () => {
      try {
        // No filter: RLS already limits this to the household, and a person is
        // identified by auth_user_id (a joined member) or user_id (the creator).
        const { data } = await supabase
          .from('family_members')
          .select('id, user_id, auth_user_id')
        const rows = (data ?? []) as MemberRow[]
        // Cache only a successful answer; a failure must be retried on the next
        // write rather than pinned for the life of the tab.
        if (rows.length > 0) memberRowsCache = { userId: user.id, rows }
        return rows.length > 0 ? rows : null
      } catch {
        return null
      } finally {
        if (memberRowsInFlight?.userId === user.id) memberRowsInFlight = null
      }
    })()
    memberRowsInFlight = { userId: user.id, promise }
  }
  const rows = await memberRowsInFlight!.promise
  return rows ? { authUserId: user.id, rows } : null
}

/**
 * The signed-in user's own family-member id — the `self` for a routine THEY
 * own. Resolution goes through memberForAuthUser, which matches on
 * `auth_user_id` or the creator's own seed row and nothing else.
 *
 * It used to fall back to "the first row with is_full_user" when neither
 * matched. In a two-adult house that row is as likely to be the PARTNER: a
 * routine assigned to the partner then read as "assigned to myself", landed
 * 'individual', and was invisible to the very person it was handed to. Null is
 * the safe answer here — it costs the self-exclusion only, and over-sharing
 * ('couple' for something assigned to yourself) never locks anybody out.
 */
async function currentMemberId(): Promise<string | null> {
  const house = await householdMembers()
  if (!house) return null
  return memberForAuthUser(house.rows, house.authUserId)?.id ?? null
}

/**
 * The `self` an EXISTING routine's scope must be derived against: the member
 * who OWNS the row (`routines.user_id`), not whoever is editing it.
 *
 * Deriving against the editor lets a partner narrow a routine that was shared
 * WITH her: her id filters out of the assignee list, others=[] → 'individual',
 * and she deletes her own access without a word on screen. Falls back to the
 * signed-in user only when the row is theirs (or its owner is unknown).
 */
async function ownerMemberId(ownerUserId: string | null | undefined): Promise<string | null> {
  const house = await householdMembers()
  if (!house) return null
  const owner = memberForAuthUser(house.rows, ownerUserId)
  if (owner) return owner.id
  if (!ownerUserId || ownerUserId === house.authUserId) {
    return memberForAuthUser(house.rows, house.authUserId)?.id ?? null
  }
  return null
}

/** Test seam: forget the resolved household (mirrors __resetTasksCache). */
export function __resetSelfMemberCache() {
  memberRowsCache = null
  memberRowsInFlight = null
}

/** Insert-or-replace, keeping the name ordering every consumer assumes. */
function applyUpsert(prev: Routine[], routine: Routine): Routine[] {
  const without = prev.filter(r => r.id !== routine.id)
  return [...without, routine].sort(byName)
}

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
  // updateRoutine needs the row's CURRENT context and scope to decide whether a
  // context change should move the share, and it must stay dependency-free
  // (every consumer passes it down as a handler prop). A ref gives it the live
  // list without rebuilding the callback on each fetch — the same shape
  // useSupabaseTasks' findTaskById uses.
  const routinesRef = useRef<Routine[]>(routines)
  routinesRef.current = routines
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
      const { data: { user } } = await getAuthUser()
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

  // Writes from OTHER instances in this tab, and from other tabs/devices.
  useEffect(() => {
    const onLocalWrite = (e: Event) => {
      const detail = (e as CustomEvent<LocalRoutineWrite>).detail
      setRoutines(prev => {
        if (detail.kind === 'delete') return prev.filter(r => r.id !== detail.id)
        if (detail.kind === 'patch') {
          return prev
            .map(r => (r.id === detail.id ? { ...r, ...detail.updates } as Routine : r))
            .sort(byName)
        }
        return applyUpsert(prev, detail.routine)
      })
    }
    localRoutineWrites.addEventListener('write', onLocalWrite)

    // The topic must be unique per instance: supabase-js hands back the SAME
    // channel object for a repeated topic, so a second .subscribe() errors and
    // any one instance's unmount would tear down the channel for everyone —
    // the bug useSupabaseTasks already had to fix.
    const channel = supabase
      .channel(`routines-changes-${++routinesChannelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routines' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string })?.id
          if (id) setRoutines(prev => prev.filter(r => r.id !== id))
          return
        }
        const row = payload.new as Routine
        if (row?.id) setRoutines(prev => applyUpsert(prev, row))
      })
      .subscribe()

    // A reconnect resumes delivery going forward only; refetch to close the gap.
    const stopResumed = onRealtimeResumed(() => { void fetchRoutines() })

    return () => {
      localRoutineWrites.removeEventListener('write', onLocalWrite)
      channel.unsubscribe()
      stopResumed()
    }
  }, [fetchRoutines])

  // Create a new routine
  const addRoutine = useCallback(async (input: CreateRoutineInput): Promise<Routine | null> => {
    setError(null)

    try {
      const { data: { user } } = await getAuthUser()
      if (!user) throw new Error('Not authenticated')

      // Determine effective assigned_to: explicit value takes precedence, then fallback
      const effectiveAssignedTo = input.assigned_to !== undefined
        ? input.assigned_to
        : input.defaultFallbackAssignee ?? null
      const selfId = await currentMemberId()

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
          // RLS reads scope and nothing else, so a routine written without one
          // looks like household work and is readable only by its owner. 23 of
          // Scott's family routines were in exactly that state — "Iris laundry
          // and clothes processing" among them. It is DERIVED, never chosen.
          scope: scopeForDomain(input.context ?? null, [effectiveAssignedTo], selfId),
          project_id: input.project_id ?? null,
          parent_routine_id: input.parent_routine_id ?? null,
          step_order: input.step_order ?? null,
          pin_to_timeline: input.pin_to_timeline ?? false,
        })
        .select()
        .single()

      if (insertError) throw insertError

      const routine = data as Routine
      setRoutines(prev => applyUpsert(prev, routine))
      announceRoutineWrite({ kind: 'upsert', routine })
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
      if (input.paused_until !== undefined) updates.paused_until = input.paused_until
      if (input.default_assignee !== undefined) updates.default_assignee = input.default_assignee
      if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to
      if (input.assigned_to_all !== undefined) updates.assigned_to_all = input.assigned_to_all
      if (input.context !== undefined) updates.context = input.context
      // Scope is DERIVED from the routine's domain + its assignees, and
      // recomputed whenever one of those moves. Tagging a routine `family` used
      // to write context alone, leaving the row at the 'individual' column
      // default — on every family surface for its owner, nowhere for the rest
      // of the house. The recompute also walks the share BACK when a family
      // routine is re-tagged private.
      if (
        input.context !== undefined ||
        input.assigned_to !== undefined ||
        input.assigned_to_all !== undefined
      ) {
        //
        // Only when this instance can actually SEE the row: deriving from the
        // input alone would read a family routine's missing context as null and
        // narrow it off the wall. The one safe exception is an explicit move
        // into `family`, which decides the scope by itself.
        const current = routinesRef.current.find(r => r.id === id)
        if (current || input.context === 'family') {
          const next = { ...current, ...input }
          updates.scope = scopeForDomain(
            next.context ?? null,
            [next.assigned_to, ...(next.assigned_to_all ?? [])],
            // The row's OWNER, not the editor — see ownerMemberId.
            await ownerMemberId(current?.user_id),
          )
        }
      }
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
        prev.map(r => (r.id === id ? { ...r, ...updates } as Routine : r)).sort(byName)
      )
      // A PATCH, not the merged row: every instance holds its own copy, so each
      // applies the same delta to whatever it has. Announcing a whole row built
      // from this instance's state would push this instance's staleness onto
      // the others, and computing it inside the setState updater would be a
      // side effect in a reducer that StrictMode double-invokes.
      announceRoutineWrite({ kind: 'patch', id, updates })
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
      announceRoutineWrite({ kind: 'delete', id })
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
