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
    : { bg: 'bg-neutral-50', text: 'text-neutral-300', ring: 'ring-neutral-100' }

  const initials = member?.initials || null
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
      ) : initials ? (
        initials
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
        </svg>
      )}
    </Component>
  )
}
