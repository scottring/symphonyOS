import type { TimelineItem } from '@/types/timeline'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'

interface ScheduleItemProps {
  item: TimelineItem
  selected?: boolean
  onSelect: () => void
  onToggleComplete: () => void
}

export function ScheduleItem({ item, selected, onSelect, onToggleComplete }: ScheduleItemProps) {
  const isTask = item.type === 'task'

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleComplete()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }

  const timeDisplay = item.startTime
    ? item.endTime
      ? formatTimeRange(item.startTime, item.endTime, item.allDay)
      : formatTime(item.startTime)
    : null

  return (
    <div
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer
        transition-all duration-150 border
        ${selected
          ? 'bg-primary-50/50 border-primary-200 shadow-sm'
          : 'bg-white border-neutral-100 hover:border-neutral-200 hover:shadow-sm'
        }
        ${item.completed ? 'opacity-50' : ''}
      `}
    >
      {/* Time column - fixed width, vertically centered */}
      <div className="w-14 flex-shrink-0 flex items-center">
        {timeDisplay ? (
          <span className="text-xs text-neutral-400 font-medium leading-tight">
            {timeDisplay}
          </span>
        ) : (
          <span className="text-xs text-neutral-300">—</span>
        )}
      </div>

      {/* Checkbox/dot column - fixed width container, contents centered */}
      <div className="w-5 flex-shrink-0 flex items-center justify-center">
        {isTask ? (
          <button
            onClick={handleCheckboxClick}
            className="touch-target flex items-center justify-center"
            aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            <span
              className={`
                w-5 h-5 rounded-md border-2
                flex items-center justify-center
                transition-colors
                ${item.completed
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'border-neutral-300 hover:border-primary-400'
                }
              `}
            >
              {item.completed && (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </span>
          </button>
        ) : (
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
        )}
      </div>

      {/* Title and type badge - left aligned */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className={`
            text-sm font-medium truncate
            ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
          `}
        >
          {item.title}
        </span>

        {/* Type badge - inline with title */}
        <span
          className={`
            text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0
            ${isTask
              ? 'bg-primary-100 text-primary-600'
              : 'bg-blue-100 text-blue-600'
            }
          `}
        >
          {isTask ? 'Task' : 'Event'}
        </span>
      </div>

      {/* Context indicator - shows if there's extra info */}
      {(item.notes || item.links?.length || item.phoneNumber || item.location) && (
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3.5 h-3.5 text-neutral-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  )
}
