import { getTaskAgeInfo, getAgeIndicatorClasses, type TaskAgeInfo } from '@/lib/taskAge'

interface AgeIndicatorProps {
  createdAt: Date | string
  size?: 'sm' | 'md'
  showIcon?: boolean
}

/**
 * AgeIndicator - Shows how long a task has been in the inbox
 *
 * Only displays for tasks older than 3 days to avoid clutter.
 * Uses warm, non-judgmental colors to encourage action without guilt.
 */
export function AgeIndicator({
  createdAt,
  size = 'sm',
  showIcon = true,
}: AgeIndicatorProps) {
  const ageInfo = getTaskAgeInfo(createdAt)

  // Don't show indicator for fresh items (< 4 days)
  if (!ageInfo.label) {
    return null
  }

  const classes = getAgeIndicatorClasses(ageInfo.color)
  const sizeClasses = size === 'sm' ? 'text-xs' : 'text-sm'
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  return (
    <span
      className={`
        ${classes}
        ${sizeClasses}
        ${ageInfo.shouldPulse ? 'animate-subtle-pulse' : ''}
      `}
      title={`Created ${ageInfo.days} days ago`}
    >
      {showIcon && <ClockIcon className={iconSize} />}
      <span>{ageInfo.label}</span>
    </span>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

/**
 * Compact age dot indicator for use in tight spaces
 */
export function AgeIndicatorDot({
  createdAt,
  className = '',
}: {
  createdAt: Date | string
  className?: string
}) {
  const ageInfo = getTaskAgeInfo(createdAt)

  // Only show for aging items
  if (ageInfo.category === 'fresh' || ageInfo.category === 'recent') {
    return null
  }

  const dotColorClasses = getDotColorClasses(ageInfo)

  return (
    <span
      className={`
        inline-block w-2 h-2 rounded-full
        ${dotColorClasses}
        ${ageInfo.shouldPulse ? 'animate-subtle-pulse' : ''}
        ${className}
      `}
      title={`${ageInfo.days} days old`}
    />
  )
}

function getDotColorClasses(ageInfo: TaskAgeInfo): string {
  switch (ageInfo.color) {
    case 'amber':
      return 'bg-amber-400'
    case 'warning':
      return 'bg-warning-500'
    case 'orange':
      return 'bg-orange-500'
    case 'danger':
      return 'bg-danger-500'
    default:
      return 'bg-neutral-400'
  }
}

export default AgeIndicator
