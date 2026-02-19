import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface HouseholdInvitation {
  id: string
  household_id: string
  email: string
  invited_by: string
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export function useHouseholdInvitations() {
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchInvitations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('household_invitations')
        .select('*')
        .eq('invited_by', user.id)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      setInvitations(data ?? [])
    } catch (err) {
      console.error('Error fetching invitations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  const createInvitation = useCallback(async (email: string): Promise<HouseholdInvitation | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Get user's household
    const { data: householdId } = await supabase.rpc('get_user_household_id')
    if (!householdId) throw new Error('No household found')

    const { data, error } = await supabase
      .from('household_invitations')
      .insert({
        household_id: householdId,
        email: email.toLowerCase().trim(),
        invited_by: user.id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new Error('An invitation has already been sent to this email')
      }
      throw error
    }

    setInvitations(prev => [data, ...prev])
    return data
  }, [])

  const deleteInvitation = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('household_invitations')
      .delete()
      .eq('id', id)

    if (error) throw error
    setInvitations(prev => prev.filter(i => i.id !== id))
  }, [])

  const acceptInvitation = useCallback(async (token: string) => {
    const { data, error } = await supabase.rpc('accept_household_invitation', {
      invitation_token: token,
    })

    if (error) throw error
    return data as { household_id: string; status: string }
  }, [])

  const getInvitationByToken = useCallback(async (token: string): Promise<HouseholdInvitation | null> => {
    const { data, error } = await supabase
      .from('household_invitations')
      .select('*')
      .eq('token', token)
      .is('accepted_at', null)
      .single()

    if (error) return null
    return data
  }, [])

  return {
    invitations,
    loading,
    createInvitation,
    deleteInvitation,
    acceptInvitation,
    getInvitationByToken,
    refetch: fetchInvitations,
  }
}
