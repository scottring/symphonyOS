import { useState, useEffect, useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { shareInFlight } from '@/lib/sharedRequest'
import type { FamilyMember } from '@/types/family'

// One in-flight seed attempt shared across ALL hook instances in this tab.
// A per-instance ref cannot stop N simultaneously-mounted instances from
// racing each other past the DB empty-check — every instance reads "no rows"
// before any insert lands (9 duplicate self rows on 2026-07-20, 5 on
// 2026-06-27). The DB partial unique index `family_members_one_self_row`
// (one is_full_user row with null auth_user_id per user_id) is the backstop
// for cross-tab races: a lost race fails the insert and we adopt the
// winner's row instead.
let seedInFlight: Promise<FamilyMember[] | null> | null = null

async function seedSelfMemberOnce(): Promise<FamilyMember[] | null> {
  const { data: { user } } = await getAuthUser()
  if (!user) return null

  // If this user already has ANY member row, adopt it instead of inserting.
  const { data: existing } = await supabase
    .from('family_members')
    .select('*')
    .eq('user_id', user.id)
    .order('display_order', { ascending: true })
  if (existing && existing.length > 0) return existing

  const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Me'
  const initials = userName.split(/\s+/).map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()

  const { data, error } = await supabase
    .from('family_members')
    .insert([{ name: userName, initials, color: 'blue', is_full_user: true, display_order: 0, avatar_url: null, member_type: 'core' as const, role_label: 'parent', user_id: user.id }])
    .select()

  if (error || !data) {
    // Insert rejected — most likely the unique index caught a concurrent
    // seed from another tab. Fetch and adopt whatever won.
    const { data: after } = await supabase
      .from('family_members')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true })
    return after && after.length > 0 ? after : null
  }
  return data
}

export function useFamilyMembers() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) return

      setCurrentUserId(user.id)

      // RLS policies handle household sharing - no need to filter by user_id.
      // Shared: a single route mounts this hook ten times over.
      const { data, error } = await shareInFlight(
        `family_members:${user.id}`,
        async () => await supabase.from('family_members').select('*').order('display_order', { ascending: true }),
      )

      if (error) throw error
      // Deduplicate by id (in case of data issues)
      const uniqueMembers = data ? Array.from(new Map(data.map(m => [m.id, m])).values()) : []
      setMembers(uniqueMembers)
    } catch (err) {
      console.error('Error fetching family members:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch family members'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // Auto-seed the user's own member row if none exists (first-time setup).
  // All concurrently-mounted instances share one attempt via seedInFlight;
  // the promise resets in finally so a later render can retry after failure.
  useEffect(() => {
    if (loading || members.length > 0) return
    const attempt = (seedInFlight ??= seedSelfMemberOnce().finally(() => {
      seedInFlight = null
    }))
    attempt
      .then((rows) => {
        if (rows && rows.length > 0) setMembers(rows)
      })
      .catch((err) => {
        console.error('Error seeding family members:', err)
      })
  }, [loading, members.length])

  const addMember = useCallback(async (member: Omit<FamilyMember, 'id' | 'user_id' | 'created_at'>) => {
    try {
      const { data: { user } } = await getAuthUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('family_members')
        .insert({ ...member, user_id: user.id })
        .select()
        .single()

      if (error) throw error
      setMembers(prev => [...prev, data])
      return data
    } catch (err) {
      console.error('Error adding family member:', err)
      throw err
    }
  }, [])

  const updateMember = useCallback(async (id: string, updates: Partial<FamilyMember>) => {
    try {
      const { data, error } = await supabase
        .from('family_members')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      setMembers(prev => prev.map(m => m.id === id ? data : m))
      return data
    } catch (err) {
      console.error('Error updating family member:', err)
      throw err
    }
  }, [])

  const deleteMember = useCallback(async (id: string) => {
    /** A reason written for people (Settings shows it); raw DB errors are not. */
    const explain = (message: string) => Object.assign(new Error(message), { userFacing: true })
    // A member appears on tasks two ways: `assigned_to` (a foreign key with no
    // ON DELETE, so it must be cleared before the row can go) and the
    // `assigned_to_all` list (no key at all, so a delete used to leave the
    // removed person's id behind). Clear both, confirm every row actually
    // changed (RLS can silently skip a row), and hand everything back if any
    // step fails. Scope is deliberately NOT re-derived here: narrowing who can
    // see a task is an access change, not part of removing a person.
    const cleared: string[] = []
    const listsChanged: { id: string; list: string[] }[] = []
    /** Put back what changed. Returns the task ids that could NOT be
     *  confirmed restored: an error, or an UPDATE that RLS silently turned into
     *  zero rows, both count — "no error" is not "restored". */
    const restore = async (): Promise<string[]> => {
      const unrestored: string[] = []
      for (const row of listsChanged) {
        const { data, error } = await supabase.from('tasks').update({ assigned_to_all: row.list }).eq('id', row.id).select('id')
        if (error || !((data ?? []) as { id: string }[]).some((t) => t.id === row.id)) unrestored.push(row.id)
      }
      if (cleared.length > 0) {
        const { data, error } = await supabase.from('tasks').update({ assigned_to: id }).in('id', cleared).select('id')
        const back = new Set(((data ?? []) as { id: string }[]).map((t) => t.id))
        for (const taskId of cleared) if (error || !back.has(taskId)) unrestored.push(taskId)
      }
      return [...new Set(unrestored)]
    }
    try {
      const { data: assigned, error: readError } = await supabase
        .from('tasks')
        .select('id')
        .eq('assigned_to', id)
      if (readError) throw readError
      const taskIds = (assigned ?? []).map((t: { id: string }) => t.id)

      const { data: shared, error: sharedError } = await supabase
        .from('tasks')
        .select('id, assigned_to_all')
        .contains('assigned_to_all', [id])
      if (sharedError) throw sharedError

      if (taskIds.length > 0) {
        const { data: done, error: unassignError } = await supabase
          .from('tasks')
          .update({ assigned_to: null })
          .in('id', taskIds)
          .select('id')
        cleared.push(...((done ?? []) as { id: string }[]).map((t) => t.id))
        if (unassignError) throw unassignError
        if (cleared.length !== taskIds.length) {
          throw explain(`${taskIds.length - cleared.length} of their tasks couldn't be unassigned`)
        }
      }

      for (const row of (shared ?? []) as { id: string; assigned_to_all: string[] | null }[]) {
        const list = row.assigned_to_all ?? []
        const { data: done, error: listError } = await supabase
          .from('tasks')
          .update({ assigned_to_all: list.filter((m) => m !== id) })
          .eq('id', row.id)
          .select('id')
        if (listError) throw listError
        if (!done || done.length === 0) throw explain("A shared task still lists them and couldn't be updated")
        listsChanged.push({ id: row.id, list })
      }

      // Confirm the member row itself went: RLS turns a forbidden DELETE into
      // zero rows with no error, which used to read as success.
      const { data: gone, error } = await supabase
        .from('family_members')
        .delete()
        .eq('id', id)
        .select('id')
      // 23503: a task this user cannot see (someone's private task) still has
      // them as its assignee — verified with two accounts, 2026-09-23.
      if (error?.code === '23503') {
        throw explain("They're still the assignee on a task you can't see — someone's private task. Ask its owner to reassign it first")
      }
      if (error) throw error
      if (!((gone ?? []) as { id: string }[]).some((m) => m.id === id)) {
        throw explain("They couldn't be removed — you may not have permission")
      }
      setMembers(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      const unrestored = await restore()
      console.error('Error deleting family member:', err)
      // The caller says "nothing was changed" only when every change was
      // confirmed undone; otherwise it says how many tasks to check.
      throw Object.assign(err instanceof Error ? err : new Error(String((err as { message?: string })?.message ?? err)), {
        restored: unrestored.length === 0,
        unrestoredTaskIds: unrestored,
      })
    }
  }, [])

  // Helper to get member by ID
  const getMember = useCallback((id: string | null | undefined): FamilyMember | undefined => {
    if (!id) return undefined
    return members.find(m => m.id === id)
  }, [members])

  // Helper to get the current user's family member record
  const getCurrentUserMember = useCallback((): FamilyMember | undefined => {
    if (currentUserId) {
      // Check auth_user_id first (for joined household members like Iris)
      const authMatch = members.find(m => m.auth_user_id === currentUserId)
      if (authMatch) return authMatch
      // Then check user_id (for the household creator)
      const match = members.find(m => m.user_id === currentUserId)
      if (match) return match
    }
    // Fallback for legacy data or before user_id is loaded
    return members.find(m => m.is_full_user)
  }, [members, currentUserId])

  return {
    members,
    loading,
    error,
    addMember,
    updateMember,
    deleteMember,
    getMember,
    getCurrentUserMember,
    refetch: fetchMembers,
  }
}
