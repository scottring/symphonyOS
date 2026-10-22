import { useCallback } from 'react'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'

/** A logger's first name from their user id. */
export function useMemberName(): (userId: string) => string | undefined {
  const { members } = useFamilyMembers()
  return useCallback((userId: string) => {
    // A joined member is matched by their account; the household's own full member by user_id.
    const m = members.find((x) => x.auth_user_id === userId)
      ?? members.find((x) => !x.auth_user_id && x.is_full_user && x.user_id === userId)
    return m?.name.trim().split(/\s+/)[0] || undefined
  }, [members])
}
