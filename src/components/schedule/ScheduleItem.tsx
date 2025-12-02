import type { TimelineItem } from '@/types/timeline'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'

interface ScheduleItemProps {
  item: TimelineItem
  selected?: boolean
  onSelect: () => void
  onToggleComplete: () => void
  contactName?: string
}

export function ScheduleItem({ item, selected, onSelect, onToggleComplete, contactName }: ScheduleItemProps) {
  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isActionable = isTask || isRoutine // Items with checkboxes

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

  // Parse time display - could be single time, range (pipe-separated), or "All day"
  const getTimeDisplay = () => {
    if (!item.startTime) return null

    if (item.endTime) {
      const rangeStr = formatTimeRange(item.startTime, item.endTime, item.allDay)
      if (rangeStr === 'All day') {
        return { type: 'allday' as const }
      }
      const [start, end] = rangeStr.split('|')
      return { type: 'range' as const, start, end }
    }

    return { type: 'single' as const, time: formatTime(item.startTime) }
  }

  const timeDisplay = getTimeDisplay()

  return (
    <div
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className={`
        flex items-center gap-3 pl-2 pr-4 py-3 rounded-xl cursor-pointer
        transition-all duration-150 border
        ${selected
          ? 'bg-primary-50/50 border-primary-200 shadow-sm'
          : 'bg-white border-neutral-100 hover:border-neutral-200 hover:shadow-sm'
        }
        ${item.completed ? 'opacity-50' : ''}
      `}
    >
      {/* Time column - compact, left-aligned */}
      <div className="w-8 shrink-0 text-left">
        {timeDisplay ? (
          timeDisplay.type === 'allday' ? (
            <div className="flex flex-col text-xs text-neutral-400 font-medium leading-tight">
              <span>All</span>
              <span>day</span>
            </div>
          ) : timeDisplay.type === 'range' ? (
            <div className="flex flex-col text-xs text-neutral-400 font-medium leading-tight">
              <span>{timeDisplay.start}</span>
              <span>{timeDisplay.end}</span>
            </div>
          ) : (
            <span className="text-xs text-neutral-400 font-medium">{timeDisplay.time}</span>
          )
        ) : (
          <span className="text-xs text-neutral-300">—</span>
        )}
      </div>

      {/* Checkbox/dot column */}
      <div className="w-5 shrink-0 flex items-center justify-center">
        {isActionable ? (
          <button
            onClick={handleCheckboxClick}
            className="touch-target flex items-center justify-center"
            aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            <span
              className={`
                w-5 h-5 border-2
                flex items-center justify-center
                transition-colors
                ${isRoutine ? 'rounded-full' : 'rounded-md'}
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
          <div className="w-2.5 h-2.5 rounded-full bg-primary-400" />
        )}
      </div>

      {/* Title and contact chip */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className={`
            text-base font-medium truncate
            ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
          `}
        >
          {item.title}
        </span>
        {contactName && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-xs font-medium flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
            {contactName}
          </span>
        )}
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
