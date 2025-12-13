import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'
import { getProjectColor } from '@/lib/projectUtils'
import { PushDropdown, SchedulePopover, type ScheduleContextItem } from '@/components/triage'
import { AssigneeDropdown, MultiAssigneeDropdown } from '@/components/family'
import { Redo2 } from 'lucide-react'

interface ScheduleItemProps {
  item: TimelineItem
  selected?: boolean
  onSelect: () => void
  onToggleComplete: () => void
  onPush?: (date: Date) => void
  onSchedule?: (date: Date, isAllDay: boolean) => void
  onSkip?: () => void
  contactName?: string
  projectName?: string
  projectId?: string
  parentTaskName?: string
  parentTaskId?: string
  onOpenParentTask?: (taskId: string) => void
  // Family member assignment
  familyMembers?: FamilyMember[]
  assignedTo?: string | null
  onAssign?: (memberId: string | null) => void
  // Multi-member assignment (for events)
  assignedToAll?: string[]
  onAssignAll?: (memberIds: string[]) => void
  // Overdue styling
  isOverdue?: boolean
  overdueLabel?: string
  // Schedule context for the schedule popover
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
}

// Refined warm amber color tokens for overdue styling
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
  onSchedule,
  onSkip,
  contactName,
  projectName,
  projectId,
  parentTaskName,
  parentTaskId,
  onOpenParentTask,
  familyMembers = [],
  assignedTo,
  onAssign,
  assignedToAll = [],
  onAssignAll,
  isOverdue,
  overdueLabel,
  getScheduleItemsForDate,
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
        group relative rounded-2xl cursor-pointer
        transition-all duration-200 ease-out bg-white
        ${selected
          ? 'shadow-lg ring-1 ring-primary-200/80 scale-[1.01]'
          : 'hover:shadow-md'
        }
      `}
    >

      {/* Content wrapper */}
      <div className="relative px-4 py-3.5">
        {/* Left edge indicator - amber for overdue, project color otherwise */}
        {(isOverdue || projectColor) && (
          <div
            className="absolute left-0 top-[20%] w-[3px] h-[60%] rounded-r-full"
            style={{ backgroundColor: isOverdue ? overdueColors.warning500 : projectColor! }}
          />
        )}

        {/* Project name tooltip - appears on hover, positioned above card */}
        {projectName && (
          <div className="
            absolute left-4 -top-9
            opacity-0 group-hover:opacity-100
            pointer-events-none
            px-3 py-1.5 text-xs font-medium
            bg-neutral-800/95 text-white rounded-lg
            whitespace-nowrap
            transition-all duration-200 -translate-y-1 group-hover:translate-y-0
            shadow-lg backdrop-blur-sm
            z-20
          ">
            {projectName}
            <span className="absolute bottom-0 left-4 transform translate-y-1/2 rotate-45 w-2 h-2 bg-neutral-800/95" />
          </div>
        )}

        {/* Main row: time | checkbox/circle | title */}
        <div className="relative flex items-center gap-4">
          {/* Time column - fixed width for alignment, clickable to reschedule */}
          {(isTask && onSchedule) || ((isRoutine || item.type === 'event') && onPush) ? (
            <div
              className="w-14 shrink-0 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <SchedulePopover
                value={item.startTime ?? undefined}
                isAllDay={item.allDay}
                onSchedule={(date, isAllDay) => {
                  if (isTask && onSchedule) {
                    onSchedule(date, isAllDay)
                  } else if (onPush) {
                    // For routines/events, use push/reschedule as one-off
                    onPush(date)
                  }
                }}
                onClear={isTask && onSchedule ? () => {
                  // Clear schedule - set to unscheduled (inbox) - only for tasks
                  onSchedule(undefined as unknown as Date, false)
                } : undefined}
                getItemsForDate={getScheduleItemsForDate}
                trigger={
                  <button
                    className="w-full text-left text-xs font-medium rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-neutral-100/80 transition-all duration-150 cursor-pointer"
                    title="Change time"
                  >
                    {isOverdue && overdueLabel ? (
                      <span className="font-semibold" style={{ color: overdueColors.warning600 }}>
                        {overdueLabel}
                      </span>
                    ) : timeDisplay ? (
                      timeDisplay.type === 'allday' ? (
                        <span className="text-neutral-400 font-medium">All day</span>
                      ) : timeDisplay.type === 'range' ? (
                        <div className="leading-tight">
                          <div className="text-neutral-500 font-medium">{timeDisplay.start}</div>
                          <div className="text-neutral-300">{timeDisplay.end}</div>
                        </div>
                      ) : (
                        <span className="text-neutral-500 tabular-nums font-medium">{timeDisplay.time}</span>
                      )
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </button>
                }
              />
            </div>
          ) : (
            <div className="w-14 shrink-0 text-xs font-medium">
              {isOverdue && overdueLabel ? (
                <span
                  className="text-xs font-semibold"
                  style={{ color: overdueColors.warning600 }}
                >
                  {overdueLabel}
                </span>
              ) : timeDisplay ? (
                timeDisplay.type === 'allday' ? (
                  <span className="text-neutral-400 font-medium">All day</span>
                ) : timeDisplay.type === 'range' ? (
                  <div className="leading-tight">
                    <div className="text-neutral-500 font-medium">{timeDisplay.start}</div>
                    <div className="text-neutral-300">{timeDisplay.end}</div>
                  </div>
                ) : (
                  <span className="text-neutral-500 tabular-nums font-medium">{timeDisplay.time}</span>
                )
              ) : (
                <span className="text-neutral-300">—</span>
              )}
            </div>
          )}

          {/* Checkbox/circle - fixed width for alignment */}
          <div className="w-6 shrink-0 flex items-center justify-center">
            {isActionable ? (
              <button
                onClick={handleCheckboxClick}
                className="touch-target flex items-center justify-center -m-2 p-2 group/check"
                aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                <span
                  className={`
                    w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200
                    ${isRoutine ? 'rounded-full' : ''}
                    ${item.completed
                      ? 'bg-primary-500 border-primary-500 text-white shadow-sm scale-100'
                      : 'border-neutral-300 group-hover/check:border-primary-400 group-hover/check:bg-primary-50 group-hover/check:scale-105'
                    }
                  `}
                >
                  {item.completed && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
              </button>
            ) : (
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 shadow-sm" />
            )}
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`
                  text-base line-clamp-2 transition-colors duration-200
                  ${item.completed || item.skipped
                    ? 'line-through text-neutral-400'
                    : 'text-neutral-800 font-medium group-hover:text-neutral-900'}
                `}
              >
                {item.title}
              </span>
              {/* Category chip - only show for non-task categories */}
              {item.category && item.category !== 'task' && (
                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-600 rounded-lg text-xs font-medium">
                  {item.category === 'errand' && '🚗'}
                  {item.category === 'chore' && '🧹'}
                  {item.category === 'event' && '📅'}
                  {item.category === 'activity' && '⚽'}
                  <span className="hidden sm:inline">{item.category}</span>
                </span>
              )}
              {/* Subtask indicator */}
              {hasSubtasks && (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-lg text-xs font-medium">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                  {item.subtaskCompletedCount}/{item.subtaskCount}
                </span>
              )}
            </div>
          </div>

          {/* Skip button - for routines and events, hidden by default, shows on hover */}
          {(isRoutine || item.type === 'event') && onSkip && !item.completed && !item.skipped && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSkip()
              }}
              className="shrink-0 p-2 rounded-xl text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 transition-all duration-200 opacity-0 group-hover:opacity-100"
              title="Skip this time"
              aria-label="Skip this time"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          )}

          {/* Push button - desktop only, on hover */}
          {isTask && onPush && (
            <div
              className="hidden md:block shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <PushDropdown onPush={onPush} size="sm" showTodayOption={isOverdue} />
            </div>
          )}

          {/* Assignee avatar - use multi-select when onAssignAll is provided */}
          {familyMembers.length > 0 && onAssignAll ? (
            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MultiAssigneeDropdown
                members={familyMembers}
                selectedIds={assignedToAll}
                onSelect={onAssignAll}
                size="sm"
                label={item.type === 'event' ? "Who's attending?" : "Who's responsible?"}
              />
            </div>
          ) : familyMembers.length > 0 && onAssign && (
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
        </div>

        {/* Contact chip row - desktop only, aligned with title */}
        {hasContactChip && (
          <div className="hidden md:flex items-center gap-2 mt-2 ml-24">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50/80 text-primary-700 rounded-lg text-xs font-medium border border-primary-100/50 max-w-[120px] backdrop-blur-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              <span className="truncate">{contactName}</span>
            </span>
          </div>
        )}

        {/* Parent task or project context - shows relationship below title */}
        {(parentTaskName || projectName) && (
          <div className="flex items-center gap-1.5 mt-2 ml-24 text-xs text-neutral-400">
            <span className="font-mono text-neutral-300">└</span>
            {parentTaskName && parentTaskId ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenParentTask?.(parentTaskId)
                }}
                className="hover:text-neutral-600 hover:underline truncate max-w-[200px] transition-colors duration-150"
              >
                {parentTaskName}
              </button>
            ) : projectName ? (
              <span className="truncate max-w-[200px]">{projectName}</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
