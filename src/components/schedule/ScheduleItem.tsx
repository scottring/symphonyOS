import { memo } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { TaskContext } from '@/types/task'
import { formatTime, formatTimeRange, inferMealTime } from '@/lib/timeUtils'
import { getProjectColor } from '@/lib/projectUtils'
import { PushDropdown, SchedulePopover, ContextPicker, type ScheduleContextItem } from '@/components/triage'
import { AssigneeDropdown, MultiAssigneeDropdown } from '@/components/family'
import { Redo2 } from 'lucide-react'
import { useMobile } from '@/hooks/useMobile'
import { TaskCheckbox } from './TaskCheckbox'

// Nordic Journal calendar icon - minimal, elegant design
// Uses the event's context color (Work/Family/Personal) or falls back to primary teal-forest
function CalendarIcon({
  context,
  completed
}: {
  context?: 'work' | 'family' | 'personal' | null
  completed?: boolean
}) {
  // Primary forest-teal from design system: hsl(168 45% 30%) ≈ #2a6b5e
  const primaryColor = '#2a6b5e'
  const primaryLight = '#e8f4f1' // ~primary-50
  const completedColor = '#2a6b5e'

  // Context color mapping - matches domain switcher
  const contextColorMap = {
    work: 'rgb(37 99 235)',      // Blue-600
    family: 'rgb(217 119 6)',    // Amber-600
    personal: 'rgb(147 51 234)', // Purple-600
  }

  // Use context color if provided, otherwise use primary
  const accentColor = context ? contextColorMap[context] : primaryColor

  return (
    <div className="w-5 h-5 relative" title="Calendar event">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Calendar outline - clean rounded rectangle */}
        <rect
          x="2.5"
          y="4"
          width="15"
          height="13"
          rx="2"
          fill={completed ? completedColor : primaryLight}
          stroke={completed ? completedColor : primaryColor}
          strokeWidth="1.5"
          className="transition-colors"
        />
        {/* Calendar header line */}
        <line
          x1="2.5"
          y1="7.5"
          x2="17.5"
          y2="7.5"
          stroke={completed ? primaryLight : primaryColor}
          strokeWidth="1.5"
          className="transition-colors"
        />
        {/* Small color dot showing the context color */}
        {!completed && context && (
          <circle
            cx="10"
            cy="12"
            r="2.5"
            fill={accentColor}
          />
        )}
        {/* Checkmark when completed */}
        {completed && (
          <path
            d="M6.5 11.5L9 14L13.5 9.5"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  )
}

interface ScheduleItemProps {
  item: TimelineItem
  selected?: boolean
  onSelect: () => void
  onToggleComplete: () => void
  onToggleWaiting?: () => void
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
  // Context assignment (work/family/personal)
  onContextChange?: (context: TaskContext | undefined) => void
  // Overdue styling
  isOverdue?: boolean
  overdueLabel?: string
  // Schedule context for the schedule popover
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // Panel state (for smart close behavior)
  panelOpen?: boolean
  onClosePanel?: () => void
  // Coaching indicator
  hasCoaching?: boolean
}

// Warm amber color tokens for overdue styling
const overdueColors = {
  warning50: 'hsl(38 75% 96%)',
  warning500: 'hsl(35 80% 50%)',
  warning600: 'hsl(32 80% 44%)',
}

// Domain context colors - matches domain switcher
const contextColors = {
  work: {
    dot: 'rgb(37 99 235)', // Blue-600 (matches domain switcher)
    bg: 'rgba(37, 99, 235, 0.08)',
  },
  family: {
    dot: 'rgb(217 119 6)', // Amber-600 (matches domain switcher)
    bg: 'rgba(217, 119, 6, 0.08)',
  },
  personal: {
    dot: 'rgb(147 51 234)', // Purple-600 (matches domain switcher)
    bg: 'rgba(147, 51, 234, 0.08)',
  },
}

export const ScheduleItem = memo(function ScheduleItem({
  item,
  selected,
  onSelect,
  onToggleComplete,
  onToggleWaiting,
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
  onContextChange,
  isOverdue,
  overdueLabel,
  getScheduleItemsForDate,
  panelOpen,
  onClosePanel,
  hasCoaching,
}: ScheduleItemProps) {
  const isMobile = useMobile()
  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isEvent = item.type === 'event'
  const isActionable = isTask || isRoutine || isEvent // Events are now checkable

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()

    // Always close panel if open
    if (panelOpen && onClosePanel) {
      onClosePanel()
    }

    // Then perform the complete action
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
    // All-day items - check for meal keyword inference first
    if (item.allDay) {
      const inferred = inferMealTime(item.title)
      if (inferred && item.startTime) {
        // Show inferred time for meal events (e.g., "6:30p" for dinner)
        const inferredDate = new Date(item.startTime)
        inferredDate.setHours(inferred.hour, inferred.minute, 0, 0)
        return { type: 'single' as const, time: formatTime(inferredDate) }
      }
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
      onClick={() => {
        // If panel is open, close it
        if (panelOpen && onClosePanel) {
          onClosePanel()
        } else {
          // If panel is closed, open for this item
          onSelect()
        }
      }}
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
        ${item.completed || item.skipped ? 'opacity-60' : ''}
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
      {/* Main row: time | checkbox/circle | title */}
      <div className="relative flex items-center gap-3">
        {/* Time column - fixed width for alignment, clickable to reschedule */}
        {/* Tasks use onSchedule, routines/events use onPush for one-off rescheduling */}
        {(isTask && onSchedule) || ((isRoutine || item.type === 'event') && onPush) ? (
          <div
            className="w-12 shrink-0 relative"
            onClick={(e) => {
              e.stopPropagation()
              // Close panel when opening schedule popover
              if (panelOpen && onClosePanel) {
                onClosePanel()
              }
            }}
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
              skipToTime={true}
              itemTitle={item.title}
              trigger={
                <button
                  className="w-full text-left text-xs font-medium rounded-md px-1 py-0.5 -mx-1 hover:bg-neutral-100 transition-colors cursor-pointer"
                  title="Change time"
                >
                  {isOverdue && overdueLabel ? (
                    <span style={{ color: overdueColors.warning600 }}>
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
                </button>
              }
            />
          </div>
        ) : (
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
        )}

        {/* Checkbox/circle/calendar - fixed width for alignment, hidden on mobile when overdue */}
        {!(isMobile && isOverdue) && (
          <div className="w-5 shrink-0 flex items-center justify-center">
            {isEvent ? (
              // Calendar events show a calendar icon with the context color
              <button
                onClick={handleCheckboxClick}
                className="touch-target flex items-center justify-center -m-2 p-2"
                aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                <CalendarIcon
                  context={item.context}
                  completed={item.completed}
                />
              </button>
            ) : isActionable ? (
              // Tasks and routines show checkbox (square for tasks, circle for routines)
              <TaskCheckbox
                completed={item.completed}
                isWaiting={isTask ? item.isWaiting : undefined}
                onToggleComplete={() => handleCheckboxClick({ stopPropagation: () => {} } as React.MouseEvent)}
                onToggleWaiting={() => {
                  if (panelOpen && onClosePanel) onClosePanel()
                  onToggleWaiting?.()
                }}
                isRoutine={isRoutine}
              />
            ) : null}
          </div>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Context indicator dot - hidden by default, shown on hover */}
            {isTask && item.context && item.context in contextColors && (
              <div
                className="shrink-0 w-1.5 h-1.5 rounded-full opacity-0 md:group-hover:opacity-100 transition-opacity duration-200"
                style={{
                  backgroundColor: contextColors[item.context as keyof typeof contextColors].dot,
                }}
                title={`${item.context.charAt(0).toUpperCase() + item.context.slice(1)} context`}
              />
            )}
            <span
              className={`
                text-base font-medium line-clamp-2 transition-colors
                ${item.completed || item.skipped
                  ? 'line-through text-neutral-400'
                  : item.isWaiting
                    ? 'text-amber-600/70 italic'
                    : 'text-neutral-800 group-hover:text-neutral-900'
                }
              `}
            >
              {item.title}
              {item.isWaiting && !item.completed && (
                <span className="ml-1.5 text-xs text-amber-500 not-italic font-normal">waiting</span>
              )}
            </span>
            {/* Category chip - only show for non-task categories */}
            {item.category && item.category !== 'task' && (
              <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs font-medium">
                {item.category === 'errand' && '🚗'}
                {item.category === 'chore' && '🧹'}
                {item.category === 'event' && '📅'}
                {item.category === 'activity' && '⚽'}
                <span className="hidden sm:inline">{item.category}</span>
              </span>
            )}
            {/* Coaching sparkle indicator */}
            {hasCoaching && (
              <span className="shrink-0 text-amber-400 opacity-60" title="Coaching tips available">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                </svg>
              </span>
            )}
            {/* Subtask indicator */}
            {hasSubtasks && (
              <span className="shrink-0 inline-flex items-center gap-1 text-xs text-neutral-400">
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
            className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all opacity-0 group-hover:opacity-100"
            title="Skip this time"
            aria-label="Skip this time"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        )}

        {/* Push button - for tasks and routines, hover on desktop */}
        {(isTask || isRoutine) && onPush && (
          <div
            className={`shrink-0 ${isMobile && isOverdue ? '' : 'hidden md:block opacity-0 group-hover:opacity-100'} transition-opacity`}
            onClick={(e) => {
              e.stopPropagation()
              // Close panel when opening push dropdown
              if (panelOpen && onClosePanel) {
                onClosePanel()
              }
            }}
          >
            <PushDropdown onPush={onPush} size="sm" showTodayOption={isOverdue} />
          </div>
        )}

        {/* Context picker - hidden by default, shown on hover */}
        {(isTask || isRoutine || isEvent) && onContextChange && (
          <div
            className="shrink-0 opacity-0 md:group-hover:opacity-100 transition-opacity duration-200"
            onClick={(e) => {
              e.stopPropagation()
              // Close panel when opening context picker
              if (panelOpen && onClosePanel) {
                onClosePanel()
              }
            }}
          >
            <ContextPicker
              value={item.context ?? undefined}
              onChange={onContextChange}
            />
          </div>
        )}

        {/* Assignee avatar - use multi-select when onAssignAll is provided */}
        {familyMembers.length > 0 && onAssignAll ? (
          <div
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              // Close panel when opening assignee picker
              if (panelOpen && onClosePanel) {
                onClosePanel()
              }
            }}
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
            onClick={(e) => {
              e.stopPropagation()
              // Close panel when opening assignee picker
              if (panelOpen && onClosePanel) {
                onClosePanel()
              }
            }}
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

      {/* Location row - shows destination/location with directions link */}
      {item.location && (
        <div className="flex items-center gap-2 mt-1.5 ml-[5.75rem]">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${
              item.locationPlaceId
                ? `place_id:${item.locationPlaceId}`
                : encodeURIComponent(item.location)
            }`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-lg text-xs font-medium border border-primary-100 transition-colors group max-w-full"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <span className="truncate">{item.location}</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </a>
        </div>
      )}

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

      {/* Parent task or project context - shows relationship below title */}
      {(parentTaskName || projectName) && (
        <div className="flex items-center gap-1 mt-1 ml-[5.75rem] text-xs text-neutral-400">
          <span className="font-mono">└</span>
          {parentTaskName && parentTaskId ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenParentTask?.(parentTaskId)
              }}
              className="hover:text-neutral-600 hover:underline truncate max-w-[200px]"
            >
              {parentTaskName}
            </button>
          ) : projectName ? (
            <span className="truncate max-w-[200px]">{projectName}</span>
          ) : null}
        </div>
      )}
    </div>
  )
})
