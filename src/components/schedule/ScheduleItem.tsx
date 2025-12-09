import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'
import { getProjectColor } from '@/lib/projectUtils'
import { PushDropdown } from '@/components/triage'
import { AssigneeDropdown } from '@/components/family'

interface ScheduleItemProps {
  item: TimelineItem
  selected?: boolean
  onSelect: () => void
  onToggleComplete: () => void
  onPush?: (date: Date) => void
  contactName?: string
  projectName?: string
  projectId?: string
  // Family member assignment
  familyMembers?: FamilyMember[]
  assignedTo?: string | null
  onAssign?: (memberId: string | null) => void
  // Overdue styling
  isOverdue?: boolean
  overdueLabel?: string
}

// Warm amber color tokens for overdue styling
const overdueColors = {
  warning50: 'hsl(38 75% 96%)',
  warning500: 'hsl(35 80% 50%)',
  warning600: 'hsl(32 80% 44%)',
}

export function ScheduleItem({
  item,
  selected,
  onSelect,
  onToggleComplete,
  onPush,
  contactName,
  projectName,
  projectId,
  familyMembers = [],
  assignedTo,
  onAssign,
  isOverdue,
  overdueLabel,
}: ScheduleItemProps) {
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
    // All-day items (tasks or events) show "All day"
    if (item.allDay) {
      return { type: 'allday' as const }
    }

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

  // Check if we should hide project on mobile (passed as prop or detected)
  const hasContactChip = !!contactName
  const hasSubtasks = item.subtaskCount && item.subtaskCount > 0

  // Get project color for left edge indicator
  const projectColor = projectId ? getProjectColor(projectId) : null

  return (
    <div
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className={`
        group relative px-3 py-2.5 rounded-xl cursor-pointer
        transition-all duration-200 border
        ${selected
          ? 'bg-primary-50 border-primary-200 shadow-md ring-1 ring-primary-200'
          : 'bg-bg-elevated border-transparent hover:border-neutral-200 hover:shadow-md'
        }
        ${item.completed ? 'opacity-60' : ''}
      `}
    >
      {/* Left edge indicator - amber for overdue, project color otherwise */}
      {(isOverdue || projectColor) && (
        <div
          className="absolute left-0 top-[20%] w-[3px] h-[60%] rounded-none"
          style={{ backgroundColor: isOverdue ? overdueColors.warning500 : projectColor! }}
        />
      )}

      {/* Project name tooltip - appears on hover, positioned above card */}
      {projectName && (
        <div className="
          absolute left-0 -top-8
          opacity-0 group-hover:opacity-100
          pointer-events-none
          px-2 py-1 text-xs font-medium
          bg-neutral-800 text-white rounded
          whitespace-nowrap
          transition-opacity duration-150
          z-20
        ">
          {projectName}
        </div>
      )}
      {/* Drag handle - appears on hover, left edge */}
      <div className="
        absolute -left-6 top-1/2 -translate-y-1/2
        opacity-0 group-hover:opacity-100
        transition-opacity duration-150
        cursor-grab active:cursor-grabbing
        hidden md:flex items-center justify-center
        w-5 h-8 rounded text-neutral-300 hover:text-neutral-500
      ">
        <svg className="w-4 h-5" viewBox="0 0 16 20" fill="currentColor">
          <circle cx="5" cy="4" r="1.5" />
          <circle cx="11" cy="4" r="1.5" />
          <circle cx="5" cy="10" r="1.5" />
          <circle cx="11" cy="10" r="1.5" />
          <circle cx="5" cy="16" r="1.5" />
          <circle cx="11" cy="16" r="1.5" />
        </svg>
      </div>

      {/* Main row: time | checkbox/circle | title */}
      <div className="relative flex items-center gap-3">
        {/* Time column - fixed width for alignment */}
        <div className="w-12 shrink-0 text-xs font-medium">
          {isOverdue && overdueLabel ? (
            <span
              className="text-xs font-medium"
              style={{ color: overdueColors.warning600 }}
            >
              {overdueLabel}
            </span>
          ) : timeDisplay ? (
            timeDisplay.type === 'allday' ? (
              <span className="text-neutral-400">All day</span>
            ) : timeDisplay.type === 'range' ? (
              <div className="leading-tight text-neutral-400">
                <div>{timeDisplay.start}</div>
                <div className="text-neutral-300">{timeDisplay.end}</div>
              </div>
            ) : (
              <span className="text-sm text-neutral-500 tabular-nums">{timeDisplay.time}</span>
            )
          ) : (
            <span className="text-neutral-300">—</span>
          )}
        </div>

        {/* Checkbox/circle - fixed width for alignment */}
        <div className="w-5 shrink-0 flex items-center justify-center">
          {isActionable ? (
            <button
              onClick={handleCheckboxClick}
              className="touch-target flex items-center justify-center -m-2 p-2"
              aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              <span
                className={`
                  w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
                  ${isRoutine ? 'rounded-full' : ''}
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
            <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
          )}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <span
            className={`
              text-base font-medium line-clamp-2 transition-colors
              ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800 group-hover:text-neutral-900'}
            `}
          >
            {item.title}
          </span>
          {/* Subtask indicator */}
          {hasSubtasks && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-neutral-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              {item.subtaskCompletedCount}/{item.subtaskCount}
            </span>
          )}
        </div>

        {/* Assignee avatar */}
        {familyMembers.length > 0 && onAssign && (
          <div
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <AssigneeDropdown
              members={familyMembers}
              selectedId={assignedTo}
              onSelect={onAssign}
              size="sm"
            />
          </div>
        )}

        {/* Push button - desktop only, on hover, absolutely positioned to not affect layout */}
        {isTask && onPush && (
          <div
            className="hidden md:block absolute right-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <PushDropdown onPush={onPush} size="sm" showTodayOption={isOverdue} />
          </div>
        )}
      </div>

      {/* Contact chip row - desktop only, aligned with title */}
      {hasContactChip && (
        <div className="hidden md:flex items-center gap-2 mt-1.5 ml-[5.75rem]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100 max-w-[100px]">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
            <span className="truncate">{contactName}</span>
          </span>
        </div>
      )}
    </div>
  )
}
