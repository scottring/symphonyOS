import { useState, useEffect, useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'

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

/** What the join page needs before membership exists: whose household this
 *  is, who invited you, and the inviter's unlinked adult rows to choose
 *  from ("which one is you?"). */
export interface InvitationPreview {
  household_name: string
  inviter_name: string
  candidates: { id: string; name: string }[]
}

export function useHouseholdInvitations() {
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchInvitations = useCallback(async () => {
    try {
      const { data: { user } } = await getAuthUser()
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
    const { data: { user } } = await getAuthUser()
    if (!user) return null

    // Get user's household — an account with no household row yet (Invite
    // partner used to fail here outright) gets one created on the spot.
    let { data: householdId } = await supabase.rpc('get_user_household_id')
    if (!householdId) {
      await supabase.rpc('setup_household', { p_name: null })
      ;({ data: householdId } = await supabase.rpc('get_user_household_id'))
    }
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

  const acceptInvitation = useCallback(async (token: string, memberId?: string | null) => {
    const { data, error } = await supabase.rpc('accept_household_invitation', {
      invitation_token: token,
      member_id: memberId ?? null,
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

  /** The join page's pre-membership look: household name, inviter's first
   *  name, and the inviter's unlinked adult rows to choose from. Null when
   *  the invitation is gone or already accepted. */
  const getInvitationPreview = useCallback(async (token: string): Promise<InvitationPreview | null> => {
    const { data, error } = await supabase.rpc('invitation_preview', { invitation_token: token })
    if (error || !data) return null
    return data as InvitationPreview
  }, [])

  return {
    invitations,
    loading,
    createInvitation,
    deleteInvitation,
    acceptInvitation,
    getInvitationByToken,
    getInvitationPreview,
    refetch: fetchInvitations,
  }
}
