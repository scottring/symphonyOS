import type { TimelineItem } from '@/types/timeline'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'

interface ScheduleItemProps {
  item: TimelineItem
  selected?: boolean
  onSelect: () => void
  onToggleComplete: () => void
  contactName?: string
  projectName?: string
}

export function ScheduleItem({ item, selected, onSelect, onToggleComplete, contactName, projectName }: ScheduleItemProps) {
  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isActionable = isTask || isRoutine

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

  // Parse time display
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
        group flex items-center gap-4 px-4 py-4 rounded-2xl cursor-pointer
        transition-all duration-200 border
        ${selected
          ? 'bg-primary-50 border-primary-200 shadow-md ring-1 ring-primary-200'
          : 'bg-bg-elevated border-transparent hover:border-neutral-200 hover:shadow-md'
        }
        ${item.completed ? 'opacity-60' : ''}
      `}
    >
      {/* Time column - refined typography */}
      <div className="w-12 shrink-0 text-left">
        {timeDisplay ? (
          timeDisplay.type === 'allday' ? (
            <div className="flex flex-col text-xs text-neutral-400 font-medium leading-tight tracking-wide">
              <span>All</span>
              <span>day</span>
            </div>
          ) : timeDisplay.type === 'range' ? (
            <div className="flex flex-col text-xs text-neutral-400 font-medium leading-tight tracking-wide">
              <span>{timeDisplay.start}</span>
              <span className="text-neutral-300">{timeDisplay.end}</span>
            </div>
          ) : (
            <span className="text-sm text-neutral-500 font-medium tabular-nums">{timeDisplay.time}</span>
          )
        ) : (
          <span className="text-sm text-neutral-300 font-light">—</span>
        )}
      </div>

      {/* Checkbox/dot column with enhanced styling */}
      <div className="shrink-0 flex items-center justify-center">
        {isActionable ? (
          <button
            onClick={handleCheckboxClick}
            className="touch-target flex items-center justify-center -m-2 p-2"
            aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            <span
              className={`
                checkbox-custom
                ${isRoutine ? 'routine' : ''}
                ${item.completed ? 'checked' : ''}
              `}
            >
              {item.completed && (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </span>
          </button>
        ) : (
          <div className="w-3 h-3 rounded-full bg-gradient-to-br from-primary-400 to-primary-500 shadow-sm" />
        )}
      </div>

      {/* Title and chips */}
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <span
          className={`
            text-base font-medium truncate transition-colors
            ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800 group-hover:text-neutral-900'}
          `}
        >
          {item.title}
        </span>

        {/* Contact chip */}
        {contactName && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium shrink-0 border border-primary-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
            {contactName}
          </span>
        )}

        {/* Project chip */}
        {projectName && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium shrink-0 border border-blue-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            {projectName}
          </span>
        )}
      </div>

      {/* Context indicator - refined */}
      {(item.notes || item.links?.length || item.phoneNumber || item.location) && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 text-neutral-500"
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
