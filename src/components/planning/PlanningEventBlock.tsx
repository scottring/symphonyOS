import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

interface PlanningEventBlockProps {
  event: CalendarEvent
  height: number
}

export function PlanningEventBlock({ event, height }: PlanningEventBlockProps) {
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
      className="h-full px-2 py-1 rounded-lg bg-neutral-100 border border-neutral-200 overflow-hidden"
      style={{ minHeight: height }}
    >
      <div className="flex items-start gap-1.5">
        {/* Calendar icon */}
        <div className="shrink-0 mt-0.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3 h-3 text-neutral-400"
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
          <span className="text-xs font-medium text-neutral-600 line-clamp-1">
            {event.title}
          </span>
          {startDate && (
            <span className="text-[10px] text-neutral-400">
              {formatTime(startDate)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
