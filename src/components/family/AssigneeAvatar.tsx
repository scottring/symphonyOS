import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'

interface AssigneeAvatarProps {
  member: FamilyMember | undefined
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  className?: string
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
}

export function AssigneeAvatar({ member, size = 'md', onClick, className = '' }: AssigneeAvatarProps) {
  const colors = member
    ? FAMILY_COLORS[member.color as FamilyMemberColor] || FAMILY_COLORS.blue
    : { bg: 'bg-neutral-100', text: 'text-neutral-400', ring: 'ring-neutral-200' }

  const initials = member?.initials || '?'
  const name = member?.name || 'Unassigned'

  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      onClick={onClick}
      className={`
        ${sizeClasses[size]}
        rounded-full flex items-center justify-center font-semibold
        ${colors.bg} ${colors.text}
        ${onClick ? 'cursor-pointer hover:ring-2 active:scale-95 transition-all' : ''}
        ${onClick ? colors.ring : ''}
        ${className}
      `}
      title={name}
      aria-label={onClick ? `Assigned to ${name}. Click to change.` : `Assigned to ${name}`}
    >
      {member?.avatar_url ? (
        <img
          src={member.avatar_url}
          alt={name}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        initials
      )}
    </Component>
  )
}
