import { memo, useState } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { TaskContext } from '@/types/task'
import type { ProactiveSuggestion } from '@/types/proactiveSuggestion'
import { formatTime, formatTimeRange, inferMealTime } from '@/lib/timeUtils'
import { getProjectColor } from '@/lib/projectUtils'
import { PushDropdown, SchedulePopover, ContextPicker, type ScheduleContextItem } from '@/components/triage'
import { AssigneeDropdown, MultiAssigneeDropdown } from '@/components/family'
import { Redo2, Video } from 'lucide-react'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useMobile } from '@/hooks/useMobile'
import { TaskCheckbox } from './TaskCheckbox'
import { PromoteToProjectButton } from './PromoteToProjectButton'
import { ExpandingPanel } from './ExpandingPanel'
import { DOMAIN_COLORS } from '@/lib/domainColors'

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
  onPush?: (target: Date | 'week' | 'month' | 'quarter') => void
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
  // Event → Project promotion suggestion
  isSuggestedPromotion?: boolean
  // Visual weight variant
  variant?: 'full' | 'minimal'
  // Hide time label (for same-time grouping) — preserves column space
  hideTime?: boolean
  // Routine streak count (shown as badge for routines)
  routineStreak?: number
  // Proactive suggestions — shown on hover
  suggestions?: ProactiveSuggestion[]
  onActSuggestion?: (suggestionId: string, detail?: string, outcome?: string) => void
  onDismissSuggestion?: (suggestionId: string) => void
  onOpenGuidedChat?: (entityType: 'task' | 'contact' | 'project' | 'event', entityId: string, entityName: string, prompt?: string) => void
}

// Warm muted color tokens for overdue styling
const overdueColors = {
  warning50: 'hsl(38 50% 96%)',
  warning500: 'hsl(35 45% 55%)',
  warning600: 'hsl(32 40% 52%)',
}

// Domain context colors - shared utility (kept for future use)
const _contextColors: Record<string, { dot: string; bg: string }> = DOMAIN_COLORS

// Start Meeting button - uses context to avoid prop drilling
function StartMeetingButton({ item }: { item: TimelineItem }) {
  const ctx = useScheduleActionsContext()
  const onStartMeeting = ctx.onStartMeeting

  if (!onStartMeeting) return null

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const eventId = item.id.replace('event-', '')
    onStartMeeting(
      eventId,
      item.title,
      item.attendees || [],
      item.startTime ?? undefined,
      item.endTime ?? undefined
    )
  }

  return (
    <button
      onClick={handleClick}
      className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-all opacity-0 group-hover:opacity-100"
      title="Start meeting"
      aria-label="Start meeting"
    >
      <Video className="w-4 h-4" />
    </button>
  )
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
  isSuggestedPromotion,
  variant = 'full',
  hideTime,
  routineStreak,
  suggestions,
  onActSuggestion,
  onDismissSuggestion: _onDismissSuggestion,
  onOpenGuidedChat,
}: ScheduleItemProps) {
  const isMobile = useMobile()
  // Hover state powers the smooth expanding banner (proactive suggestions,
  // location-only metadata row). On mobile we never expand — preserves the
  // pre-existing behavior where these were never visible without hover.
  const [isHovered, setIsHovered] = useState(false)
  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isEvent = item.type === 'event'
  const isActionable = isTask || isRoutine || isEvent // Events are now checkable
  const contextColor = item.context ? DOMAIN_COLORS[item.context]?.dot : undefined

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
      data-selectable
      onClick={() => {
        // Always select this item (switches panel to show this item's details)
        onSelect()
      }}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      className={`
        group relative cursor-pointer transition-all duration-200 rounded-xl border
        ${variant === 'minimal'
          ? `px-3 py-1 border-transparent hover:bg-neutral-50/60 ${selected ? 'bg-neutral-50 ring-1 ring-neutral-200' : ''}`
          : `px-3 py-2 ${selected
              ? 'bg-primary-50 border-primary-200 shadow-md ring-1 ring-primary-200'
              : 'border-transparent hover:bg-primary-50/50 hover:border-primary-100'
            }`
        }
        ${item.completed || item.skipped ? 'opacity-60' : ''}
      `}
    >
      {/* Left edge indicator - project color only (not overdue) */}
      {projectColor && !isOverdue && (
        <div
          className="absolute left-0 top-[20%] w-[3px] h-[60%] rounded-none"
          style={{ backgroundColor: projectColor }}
        />
      )}

      {/* Main row: time | checkbox/circle | title */}
      <div className="relative flex items-center gap-3">
        {/* Time column - fixed width for alignment */}
        {hideTime ? (
          <div className="w-12 shrink-0" />
        ) : (isTask && onSchedule) || ((isRoutine || item.type === 'event') && onPush) ? (
          <div
            className="w-12 shrink-0 relative"
            onClick={(e) => {
              e.stopPropagation()
              if (panelOpen && onClosePanel) {
                onClosePanel()
              }
            }}
          >
            <SchedulePopover
              value={item.startTime ?? undefined}
              isAllDay={item.allDay}
              onSchedule={(date, isAllDay) => {
                if (onSchedule) {
                  onSchedule(date, isAllDay)
                } else if (onPush) {
                  onPush(date)
                }
              }}
              onClear={onSchedule ? () => {
                onSchedule(undefined as unknown as Date, false)
              } : undefined}
              getItemsForDate={getScheduleItemsForDate}
              skipToTime={true}
              itemTitle={item.title}
              trigger={
                <button
                  className="w-full text-left text-xs font-medium tabular-nums rounded-md px-1 py-0.5 -mx-1 hover:bg-neutral-100 transition-colors cursor-pointer"
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
                      <span className="text-neutral-500">{timeDisplay.time}</span>
                    )
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </button>
              }
            />
          </div>
        ) : (
          <div className="w-12 shrink-0 text-xs font-medium tabular-nums">
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
                <span className="text-neutral-500">{timeDisplay.time}</span>
              )
            ) : (
              <span className="text-neutral-300">—</span>
            )}
          </div>
        )}

        {/* Checkbox/circle/calendar - fixed width for alignment, hidden on mobile when overdue */}
        {!(isMobile && isOverdue) && (
          <div className="w-5 shrink-0 flex items-center justify-center relative z-[1]">
            {isEvent ? (
              // Calendar events show a calendar icon with the context color
              <button
                onClick={handleCheckboxClick}
                className="touch-target flex items-center justify-center -m-2 p-2 rounded-full"
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
                contextColor={contextColor}
              />
            ) : null}
          </div>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`
                ${variant === 'minimal' ? 'text-sm' : 'text-base'} font-medium line-clamp-2 transition-colors
                ${item.completed || item.skipped
                  ? 'line-through text-neutral-400'
                  : item.isWaiting
                    ? 'text-amber-600/70 italic'
                    : variant === 'minimal'
                    ? 'text-neutral-500 group-hover:text-neutral-700'
                    : 'text-neutral-800 group-hover:text-neutral-900'
                }
              `}
            >
              {item.title}
              {item.isWaiting && !item.completed && (
                <span className="ml-1.5 text-xs text-amber-500 not-italic font-normal">waiting</span>
              )}
            </span>
            {/* Routine streak badge */}
            {isRoutine && routineStreak != null && routineStreak > 0 && !item.completed && !item.skipped && (
              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-xs font-medium" title={`${routineStreak}-day streak`}>
                🔥 {routineStreak}
              </span>
            )}
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

        {/* Start Meeting button - for timed events only, shows on hover */}
        {isEvent && !item.allDay && !item.completed && !item.skipped && (
          <StartMeetingButton item={item} />
        )}

        {/* Promote to Project button - for events */}
        {isEvent && !item.completed && !item.skipped && (
          <PromoteToProjectButton item={item} isSuggestedPromotion={isSuggestedPromotion} />
        )}

        {/* Skip button - for routines and events, hidden by default, shows on hover */}
        {variant !== 'minimal' && (isRoutine || item.type === 'event') && onSkip && !item.completed && !item.skipped && (
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
        {variant !== 'minimal' && (isTask || isRoutine) && onPush && (
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

        {/* Right indicators — compact group: context + assignee */}
        <div className="shrink-0 flex items-center gap-0.5">
          {/* Context picker — always visible on events (no hover to reveal on touch);
              hover-only for tasks/routines to reduce visual noise */}
          {(isTask || isRoutine || isEvent) && onContextChange && (
            <div
              className={
                isEvent || item.context
                  ? 'transition-opacity'
                  : 'opacity-0 group-hover:opacity-100 transition-opacity'
              }
              onClick={(e) => {
                e.stopPropagation()
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

          {/* Assignee avatar — context is conveyed by the chip elsewhere on
              the row, so the avatar stays clean (no ring). */}
          {familyMembers.length > 0 && onAssignAll ? (
            <div
              onClick={(e) => {
                e.stopPropagation()
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
              onClick={(e) => {
                e.stopPropagation()
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
      </div>

      {/* Metadata row — location on hover, contact/project always compact */}
      {(item.location || hasContactChip || parentTaskName || projectName) && (() => {
        const onlyLocation = !hasContactChip && !parentTaskName && !projectName
        const metadataContent = (
          <div className={`flex items-center gap-2 ml-[5.75rem] flex-wrap ${onlyLocation ? 'pt-1' : 'mt-1'}`}>
            {/* Location chip — hover-only for cleaner default view */}
            {item.location && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${
                  item.locationPlaceId
                    ? `place_id:${item.locationPlaceId}`
                    : encodeURIComponent(item.location)
                }`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-primary-600 hover:text-primary-700 rounded text-[11px] font-medium transition-all opacity-0 group-hover:opacity-100 max-w-[220px]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <span className="truncate">{item.location}</span>
              </a>
            )}

            {/* Contact chip - desktop only */}
            {hasContactChip && (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-neutral-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                <span className="truncate max-w-[80px]">{contactName}</span>
              </span>
            )}

            {/* Parent task or project context */}
            {parentTaskName && parentTaskId ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenParentTask?.(parentTaskId)
                }}
                className="text-[11px] text-neutral-400 hover:text-neutral-600 hover:underline truncate max-w-[180px]"
              >
                {parentTaskName}
              </button>
            ) : projectName ? (
              <span className="text-[11px] text-neutral-400 truncate max-w-[180px]">{projectName}</span>
            ) : null}
          </div>
        )

        // If location is the only metadata, the row collapses until hover.
        // Wrap in ExpandingPanel so layout shifts smoothly instead of jumping.
        return onlyLocation
          ? <ExpandingPanel open={isHovered && !isMobile}>{metadataContent}</ExpandingPanel>
          : metadataContent
      })()}

      {/* Proactive suggestions — hover-only, ambient. Wrapped in ExpandingPanel
          so the layout below shifts smoothly when the banner appears/disappears
          rather than jerking. */}
      {suggestions && suggestions.length > 0 && !item.completed && !item.skipped && onActSuggestion && (
        <ExpandingPanel open={isHovered && !isMobile} className="ml-[5.75rem]">
          <div className="flex gap-1.5 pt-1 pb-0.5 flex-wrap">
            {suggestions.map((s) => {
              const icons: Record<string, string> = {
                call: '\u260F', text: '\u{1F4AC}', email: '\u2709', open_link: '\u2192',
                navigate: '\u{1F4CD}', followup: '\u21BB', guided_chat: '\u{1F4AD}',
                create_task: '\u2795', someday: '\u23F3', stale: '?', do_today: '\u2714',
              }
              const actionType = s.actionType || s.suggestionType
              return (
                <button
                  key={s.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    const payload = s.actionPayload
                    switch (actionType) {
                      case 'call':
                        if (payload.phoneNumber) {
                          window.open(`tel:${payload.phoneNumber}`, '_self')
                          onActSuggestion(s.id, `Called ${payload.phoneNumber}`)
                        }
                        break
                      case 'text':
                        if (payload.phoneNumber) {
                          const body = payload.messageTemplate ? `&body=${encodeURIComponent(String(payload.messageTemplate))}` : ''
                          window.open(`sms:${payload.phoneNumber}${body}`, '_self')
                          onActSuggestion(s.id, `Texted ${payload.phoneNumber}`, 'sent')
                        }
                        break
                      case 'email':
                        if (payload.email) {
                          const subject = payload.subject ? `?subject=${encodeURIComponent(String(payload.subject))}` : ''
                          window.open(`mailto:${payload.email}${subject}`, '_blank')
                          onActSuggestion(s.id, `Emailed ${payload.email}`, 'sent')
                        }
                        break
                      case 'open_link':
                        if (payload.url) {
                          window.open(String(payload.url), '_blank')
                          onActSuggestion(s.id, `Opened ${payload.url}`, 'success')
                        }
                        break
                      case 'navigate':
                        if (payload.location) {
                          const q = payload.placeId
                            ? `https://www.google.com/maps/place/?q=place_id:${payload.placeId}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(payload.location))}`
                          window.open(q, '_blank')
                          onActSuggestion(s.id, `Navigated to ${payload.location}`)
                        }
                        break
                      case 'guided_chat':
                        if (onOpenGuidedChat) {
                          const entType = item.type === 'event' ? 'event' as const : 'task' as const
                          const entId = item.type === 'event' ? item.id.replace('event-', '') : item.id.replace('task-', '')
                          const prompt = payload.prompt ? String(payload.prompt) : s.detail || `Help me think through: ${s.title}`
                          onOpenGuidedChat(entType, entId, item.title, prompt)
                          onActSuggestion(s.id, 'Opened guided chat')
                        }
                        break
                      default:
                        onActSuggestion(s.id)
                    }
                  }}
                  title={s.detail || s.title}
                  className="text-[10px] px-2 py-0.5 rounded-full border transition-colors bg-amber-50/80 border-amber-200/60 text-amber-700 hover:bg-amber-100 hover:border-amber-300"
                >
                  <span className="mr-0.5">{icons[actionType] || '\u2728'}</span>
                  {s.title}
                </button>
              )
            })}
          </div>
        </ExpandingPanel>
      )}
    </div>
  )
})
