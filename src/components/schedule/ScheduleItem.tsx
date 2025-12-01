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
        flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
        transition-colors duration-150
        ${selected
          ? 'bg-primary-50 ring-1 ring-primary-200'
          : 'hover:bg-neutral-50'
        }
        ${item.completed ? 'opacity-60' : ''}
      `}
    >
      {/* Time column */}
      <div className="w-20 flex-shrink-0 text-right">
        {timeDisplay ? (
          <span className="text-sm text-neutral-500 font-medium">{timeDisplay}</span>
        ) : (
          <span className="text-sm text-neutral-300">--</span>
        )}
      </div>

      {/* Type indicator */}
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isTask ? 'bg-primary-500' : 'bg-blue-500'
        }`}
      />

      {/* Checkbox for tasks */}
      {isTask && (
        <button
          onClick={handleCheckboxClick}
          className={`
            w-5 h-5 rounded border-2 flex-shrink-0
            flex items-center justify-center
            transition-colors
            ${item.completed
              ? 'bg-primary-500 border-primary-500 text-white'
              : 'border-neutral-300 hover:border-primary-400'
            }
          `}
          aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {item.completed && (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      )}

      {/* Title */}
      <span
        className={`
          flex-1 text-sm truncate
          ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
        `}
      >
        {item.title}
      </span>

      {/* Type badge */}
      <span
        className={`
          text-xs px-2 py-0.5 rounded-full flex-shrink-0
          ${isTask
            ? 'bg-primary-50 text-primary-600'
            : 'bg-blue-50 text-blue-600'
          }
        `}
      >
        {isTask ? 'Task' : 'Event'}
      </span>

      {/* Context indicator */}
      {(item.notes || item.links?.length || item.phoneNumber) && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-neutral-300 flex-shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      )}
    </div>
  )
}
