import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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
  const { data: { user } } = await supabase.auth.getUser()
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setCurrentUserId(user.id)

      // RLS policies handle household sharing - no need to filter by user_id
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .order('display_order', { ascending: true })

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
      const { data: { user } } = await supabase.auth.getUser()
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
    try {
      // First, unassign all tasks assigned to this member
      const { error: unassignError } = await supabase
        .from('tasks')
        .update({ assigned_to: null })
        .eq('assigned_to', id)

      if (unassignError) {
        console.error('Error unassigning tasks:', unassignError)
        // Continue with deletion even if unassign fails
      }

      // Then delete the family member
      const { error } = await supabase
        .from('family_members')
        .delete()
        .eq('id', id)

      if (error) throw error
      setMembers(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      console.error('Error deleting family member:', err)
      throw err
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
