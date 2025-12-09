export interface FamilyMember {
  id: string
  user_id: string
  name: string
  initials: string
  color: string
  avatar_url: string | null
  is_full_user: boolean
  display_order: number
  created_at: string
  auth_user_id?: string | null // Links to auth.users for users with accounts
}

// ============================================================================
// HOUSEHOLD TYPES
// ============================================================================

export interface Household {
  id: string
  name: string
  owner_id: string
  created_at: string
  updated_at: string
}

export type HouseholdMemberRole = 'owner' | 'admin' | 'member'
export type HouseholdMemberStatus = 'pending' | 'active' | 'declined'

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string
  role: HouseholdMemberRole
  status: HouseholdMemberStatus
  invited_by: string | null
  invited_email: string | null
  joined_at: string | null
  created_at: string
  // Joined data
  user_email?: string
  user_name?: string
}

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

export type FamilyMemberColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal'

export const FAMILY_COLORS: Record<FamilyMemberColor, {
  bg: string
  text: string
  ring: string
  border: string
  hoverBorder: string
  icon: string
}> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-300', border: 'border-blue-200', hoverBorder: 'hover:border-blue-300', icon: 'text-blue-400' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', ring: 'ring-purple-300', border: 'border-purple-200', hoverBorder: 'hover:border-purple-300', icon: 'text-purple-400' },
  green: { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-300', border: 'border-green-200', hoverBorder: 'hover:border-green-300', icon: 'text-green-400' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-300', border: 'border-orange-200', hoverBorder: 'hover:border-orange-300', icon: 'text-orange-400' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-700', ring: 'ring-pink-300', border: 'border-pink-200', hoverBorder: 'hover:border-pink-300', icon: 'text-pink-400' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700', ring: 'ring-teal-300', border: 'border-teal-200', hoverBorder: 'hover:border-teal-300', icon: 'text-teal-400' },
}
