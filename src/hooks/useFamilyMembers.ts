import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { FamilyMember } from '@/types/family'

export function useFamilyMembers() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const seedingRef = useRef(false)

  const fetchMembers = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true })

      if (error) throw error
      setMembers(data || [])
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

  // Auto-seed if no members exist (first-time setup)
  useEffect(() => {
    async function seedIfEmpty() {
      if (loading || members.length > 0 || seedingRef.current) return
      seedingRef.current = true

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        seedingRef.current = false
        return
      }

      // Only seed the current user - they'll add family in onboarding
      const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Me'
      const initials = userName.split(/\s+/).map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()

      const defaultMembers = [
        { name: userName, initials, color: 'blue', is_full_user: true, display_order: 0, avatar_url: null },
      ]

      try {
        const { data, error } = await supabase
          .from('family_members')
          .insert(defaultMembers.map(m => ({ ...m, user_id: user.id })))
          .select()

        if (!error && data) {
          setMembers(data)
        }
      } catch (err) {
        console.error('Error seeding family members:', err)
      } finally {
        seedingRef.current = false
      }
    }
    seedIfEmpty()
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
    return members.find(m => m.is_full_user)
  }, [members])

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
