import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'

interface PlanningEventBlockProps {
  event: CalendarEvent
  height: number
  assignee?: FamilyMember
}

export function PlanningEventBlock({ event, height, assignee }: PlanningEventBlockProps) {
  // Get colors based on assignee, fallback to neutral (event default)
  const colors = assignee
    ? FAMILY_COLORS[assignee.color as FamilyMemberColor] || FAMILY_COLORS.blue
    : null

  const bgClass = colors ? colors.bg : 'bg-neutral-100'
  const borderClass = colors ? colors.border : 'border-neutral-200'
  const textClass = colors ? colors.text : 'text-neutral-600'
  const iconClass = colors ? colors.icon : 'text-neutral-400'
  const subtextClass = colors ? colors.icon : 'text-neutral-400'
  const startTimeStr = event.start_time || event.startTime
  const startDate = startTimeStr ? new Date(startTimeStr) : null

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div
      className={`h-full px-2 py-1 rounded-lg ${bgClass} border ${borderClass} overflow-hidden`}
      style={{ minHeight: height }}
    >
      <div className="flex items-start gap-1.5">
        {/* Calendar icon */}
        <div className="shrink-0 mt-0.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-3 h-3 ${iconClass}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Event info */}
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-medium ${textClass} line-clamp-1`}>
            {event.title}
          </span>
          {startDate && (
            <span className={`text-[10px] ${subtextClass}`}>
              {formatTime(startDate)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
