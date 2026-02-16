export type AgeRange = 'infant' | 'toddler' | 'child' | 'teen' | 'adult'

export interface Medication {
  name: string
  dosage?: string
  frequency?: string
}

export type MemberType = 'core' | 'guest'

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

  // Household role
  member_type: MemberType           // 'core' = lives here, 'guest' = recurring visitor
  role_label?: string | null        // "parent", "child", "grandparent", "babysitter", etc.
  typical_involvement?: string | null // Guest only: "picks up Tuesdays", "Thursday evenings"

  // Health profile fields (optional, system-wide)
  date_of_birth?: string | null
  age_range?: AgeRange
  allergies?: string[]
  medications?: Medication[]
  dietary_restrictions?: string[]
  health_conditions?: string[]
  mobility_needs?: string | null

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
