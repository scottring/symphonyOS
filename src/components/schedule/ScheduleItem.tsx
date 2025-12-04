import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'
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
  onOpenProject?: (projectId: string) => void
  // Family member assignment
  familyMembers?: FamilyMember[]
  assignedTo?: string | null
  onAssign?: (memberId: string | null) => void
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
  onOpenProject,
  familyMembers = [],
  assignedTo,
  onAssign,
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
  const hasChips = contactName || projectName

  return (
    <div
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className={`
        group px-3 py-2.5 rounded-xl cursor-pointer
        transition-all duration-200 border
        ${selected
          ? 'bg-primary-50 border-primary-200 shadow-md ring-1 ring-primary-200'
          : 'bg-bg-elevated border-transparent hover:border-neutral-200 hover:shadow-md'
        }
        ${item.completed ? 'opacity-60' : ''}
      `}
    >
      {/* Main row: time | checkbox/circle | title */}
      <div className="relative flex items-center gap-3">
        {/* Time column - fixed width for alignment */}
        <div className="w-12 shrink-0 text-xs text-neutral-400 font-medium">
          {timeDisplay ? (
            timeDisplay.type === 'allday' ? (
              <span>All day</span>
            ) : timeDisplay.type === 'range' ? (
              <div className="leading-tight">
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
        <span
          className={`
            flex-1 min-w-0 text-base font-medium line-clamp-2 transition-colors
            ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800 group-hover:text-neutral-900'}
          `}
        >
          {item.title}
        </span>

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
            <PushDropdown onPush={onPush} size="sm" />
          </div>
        )}
      </div>

      {/* Chips row - desktop only, aligned with title */}
      {hasChips && (
        <div className="hidden md:flex items-center gap-2 mt-1.5 ml-[5.75rem]">
          {projectName && projectId && onOpenProject ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenProject(projectId)
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100 max-w-[140px] hover:bg-blue-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className="truncate">{projectName}</span>
            </button>
          ) : projectName && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100 max-w-[140px]">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className="truncate">{projectName}</span>
            </span>
          )}
          {contactName && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-xs font-medium border border-primary-100 max-w-[100px]">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              <span className="truncate">{contactName}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
