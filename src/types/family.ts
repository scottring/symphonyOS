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
}

export type FamilyMemberColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal'

export const FAMILY_COLORS: Record<FamilyMemberColor, { bg: string; text: string; ring: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-300' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', ring: 'ring-purple-300' },
  green: { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-300' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-300' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-700', ring: 'ring-pink-300' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700', ring: 'ring-teal-300' },
}
