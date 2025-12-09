import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Household, HouseholdMember, HouseholdInvitation } from '@/types/family'

interface UseHouseholdReturn {
  household: Household | null
  members: HouseholdMember[]
  invitations: HouseholdInvitation[]
  loading: boolean
  error: Error | null
  isOwner: boolean
  isAdmin: boolean
  // Actions
  createHousehold: (name?: string) => Promise<Household>
  updateHousehold: (updates: Partial<Household>) => Promise<void>
  inviteMember: (email: string) => Promise<HouseholdInvitation>
  cancelInvitation: (invitationId: string) => Promise<void>
  removeMember: (memberId: string) => Promise<void>
  updateMemberRole: (memberId: string, role: 'admin' | 'member') => Promise<void>
  acceptInvitation: (token: string) => Promise<void>
  leaveHousehold: () => Promise<void>
  refetch: () => Promise<void>
}

export function useHousehold(): UseHouseholdReturn {
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Fetch household data
  const fetchHousehold = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setHousehold(null)
        setMembers([])
        setInvitations([])
        return
      }

      setCurrentUserId(user.id)

      // Get user's household membership
      const { data: membershipData, error: membershipError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (membershipError && membershipError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine for new users
        throw membershipError
      }

      if (!membershipData) {
        // User has no household yet - create one
        const newHousehold = await createHouseholdInternal(user.id)
        setHousehold(newHousehold)
        setMembers([{
          id: 'temp',
          household_id: newHousehold.id,
          user_id: user.id,
          role: 'owner',
          status: 'active',
          invited_by: null,
          invited_email: null,
          joined_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }])
        setInvitations([])
        return
      }

      // Fetch household details
      const { data: householdData, error: householdError } = await supabase
        .from('households')
        .select('*')
        .eq('id', membershipData.household_id)
        .single()

      if (householdError) throw householdError
      setHousehold(householdData)

      // Fetch all members
      const { data: membersData, error: membersError } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', membershipData.household_id)
        .order('created_at', { ascending: true })

      if (membersError) throw membersError
      setMembers(membersData || [])

      // Fetch pending invitations (only if admin)
      const currentMember = membersData?.find(m => m.user_id === user.id)
      if (currentMember?.role === 'owner' || currentMember?.role === 'admin') {
        const { data: invitationsData, error: invitationsError } = await supabase
          .from('household_invitations')
          .select('*')
          .eq('household_id', membershipData.household_id)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())

        if (invitationsError) throw invitationsError
        setInvitations(invitationsData || [])
      } else {
        setInvitations([])
      }

    } catch (err) {
      console.error('Error fetching household:', err)
      setError(err instanceof Error ? err : new Error('Failed to fetch household'))
    } finally {
      setLoading(false)
    }
  }, [])

  // Create household (internal helper)
  async function createHouseholdInternal(userId: string, name = 'My Household'): Promise<Household> {
    // Create the household
    const { data: newHousehold, error: createError } = await supabase
      .from('households')
      .insert({ name, owner_id: userId })
      .select()
      .single()

    if (createError) throw createError

    // Add owner as member
    const { error: memberError } = await supabase
      .from('household_members')
      .insert({
        household_id: newHousehold.id,
        user_id: userId,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString(),
      })

    if (memberError) throw memberError

    return newHousehold
  }

  useEffect(() => {
    fetchHousehold()
  }, [fetchHousehold])

  // Computed values
  const currentMember = members.find(m => m.user_id === currentUserId)
  const isOwner = currentMember?.role === 'owner'
  const isAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin'

  // Create a new household (public API - for when user wants to create their own)
  const createHousehold = useCallback(async (name = 'My Household'): Promise<Household> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const newHousehold = await createHouseholdInternal(user.id, name)
    await fetchHousehold()
    return newHousehold
  }, [fetchHousehold])

  // Update household
  const updateHousehold = useCallback(async (updates: Partial<Household>) => {
    if (!household) throw new Error('No household')
    if (!isOwner) throw new Error('Only owner can update household')

    const { error } = await supabase
      .from('households')
      .update(updates)
      .eq('id', household.id)

    if (error) throw error
    setHousehold(prev => prev ? { ...prev, ...updates } : null)
  }, [household, isOwner])

  // Invite a new member
  const inviteMember = useCallback(async (email: string): Promise<HouseholdInvitation> => {
    if (!household) throw new Error('No household')
    if (!isAdmin) throw new Error('Only admins can invite members')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('household_invitations')
      .insert({
        household_id: household.id,
        email: email.toLowerCase(),
        invited_by: user.id,
      })
      .select()
      .single()

    if (error) throw error
    setInvitations(prev => [...prev, data])
    return data
  }, [household, isAdmin])

  // Cancel an invitation
  const cancelInvitation = useCallback(async (invitationId: string) => {
    if (!isAdmin) throw new Error('Only admins can cancel invitations')

    const { error } = await supabase
      .from('household_invitations')
      .delete()
      .eq('id', invitationId)

    if (error) throw error
    setInvitations(prev => prev.filter(i => i.id !== invitationId))
  }, [isAdmin])

  // Remove a member
  const removeMember = useCallback(async (memberId: string) => {
    if (!household) throw new Error('No household')
    if (!isOwner) throw new Error('Only owner can remove members')

    const memberToRemove = members.find(m => m.id === memberId)
    if (memberToRemove?.role === 'owner') {
      throw new Error('Cannot remove the household owner')
    }

    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('id', memberId)

    if (error) throw error
    setMembers(prev => prev.filter(m => m.id !== memberId))
  }, [household, isOwner, members])

  // Update member role
  const updateMemberRole = useCallback(async (memberId: string, role: 'admin' | 'member') => {
    if (!isOwner) throw new Error('Only owner can change roles')

    const { error } = await supabase
      .from('household_members')
      .update({ role })
      .eq('id', memberId)

    if (error) throw error
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m))
  }, [isOwner])

  // Accept an invitation (by token)
  const acceptInvitation = useCallback(async (token: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // Find the invitation
    const { data: invitation, error: findError } = await supabase
      .from('household_invitations')
      .select('*')
      .eq('token', token)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (findError || !invitation) {
      throw new Error('Invalid or expired invitation')
    }

    // Leave current household if any
    if (household) {
      await leaveHousehold()
    }

    // Join the new household
    const { error: joinError } = await supabase
      .from('household_members')
      .insert({
        household_id: invitation.household_id,
        user_id: user.id,
        role: 'member',
        status: 'active',
        invited_by: invitation.invited_by,
        joined_at: new Date().toISOString(),
      })

    if (joinError) throw joinError

    // Mark invitation as accepted
    await supabase
      .from('household_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    // Refetch to get the new household
    await fetchHousehold()
  }, [household, fetchHousehold])

  // Leave household
  const leaveHousehold = useCallback(async () => {
    if (!household || !currentUserId) throw new Error('No household')
    if (isOwner) throw new Error('Owner cannot leave. Transfer ownership or delete the household.')

    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', household.id)
      .eq('user_id', currentUserId)

    if (error) throw error

    // Create a new personal household
    await fetchHousehold()
  }, [household, currentUserId, isOwner, fetchHousehold])

  return {
    household,
    members,
    invitations,
    loading,
    error,
    isOwner,
    isAdmin,
    createHousehold,
    updateHousehold,
    inviteMember,
    cancelInvitation,
    removeMember,
    updateMemberRole,
    acceptInvitation,
    leaveHousehold,
    refetch: fetchHousehold,
  }
}
