import type { Routine } from '@/types/actionable'

interface PlanningRoutineBlockProps {
  routine: Routine
}

export function PlanningRoutineBlock({ routine }: PlanningRoutineBlockProps) {
  return (
    <div className="h-full px-2 py-1 rounded-lg bg-sage-50 border border-sage-200 overflow-hidden">
      <div className="flex items-start gap-1.5">
        {/* Routine icon (circle for checkbox-like appearance) */}
        <div className="shrink-0 mt-0.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3 h-3 text-sage-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Routine info */}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-sage-700 line-clamp-1">
            {routine.name}
          </span>
          {routine.time_of_day && (
            <span className="text-[10px] text-sage-500">
              {formatTimeOfDay(routine.time_of_day)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Format HH:MM to human-readable time
function formatTimeOfDay(time: string): string {
  const [hourStr, minuteStr] = time.split(':')
  const hour = parseInt(hourStr, 10)
  const minute = parseInt(minuteStr, 10)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  const displayMinute = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`
  return `${displayHour}${displayMinute} ${period}`
}
