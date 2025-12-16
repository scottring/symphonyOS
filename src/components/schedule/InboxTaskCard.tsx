import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { ScheduleContextItem } from '@/components/triage'
import { DeferPicker, SchedulePopover } from '@/components/triage'
import { AssigneeDropdown } from '@/components/family'
import { AgeIndicator } from '@/components/health'
import { useLongPress } from '@/hooks/useLongPress'
import { Check } from 'lucide-react'

// Helper to stop all mouse/touch events from bubbling to parent's longPress handler
const stopAllPropagation = {
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onMouseUp: (e: React.MouseEvent) => e.stopPropagation(),
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
}

interface InboxTaskCardProps {
  task: Task
  onDefer: (date: Date | undefined) => void
  onSchedule?: (date: Date, isAllDay: boolean) => void
  onUpdate: (updates: Partial<Task>) => void
  onSelect: () => void
  onTriage?: () => void // Open triage modal
  projects?: Project[]
  onOpenProject?: (projectId: string) => void
  // Family member assignment
  familyMembers?: FamilyMember[]
  onAssignTask?: (memberId: string | null) => void
  // Schedule context for the schedule popover
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // Bulk selection mode
  selectionMode?: boolean
  multiSelected?: boolean
  onLongPress?: () => void
  onToggleSelect?: () => void
}

export function InboxTaskCard({
  task,
  onDefer,
  onSchedule,
  onUpdate,
  onSelect,
  onTriage,
  projects = [],
  onOpenProject,
  familyMembers = [],
  onAssignTask,
  getScheduleItemsForDate,
  selectionMode,
  multiSelected,
  onLongPress,
  onToggleSelect,
}: InboxTaskCardProps) {
  const project = projects.find(p => p.id === task.projectId)

  // Long press to enter selection mode
  const longPressHandlers = useLongPress({
    onLongPress: () => {
      if (onLongPress) {
        onLongPress()
      }
    },
    onClick: () => {
      if (selectionMode && onToggleSelect) {
        onToggleSelect()
      } else {
        onSelect()
      }
    },
  })

  const handleSchedule = (date: Date, isAllDay: boolean) => {
    if (onSchedule) {
      onSchedule(date, isAllDay)
    } else {
      // Fallback to onUpdate if onSchedule not provided
      onUpdate({ scheduledFor: date, isAllDay, deferredUntil: undefined })
    }
  }

  return (
    <div
      {...longPressHandlers}
      className={`
        group relative bg-white rounded-2xl py-3.5 cursor-pointer
        hover:shadow-md transition-all duration-200 ease-out
        ${selectionMode ? 'pl-12 pr-4' : 'px-4'}
        ${multiSelected ? 'ring-2 ring-primary-400 bg-primary-50/50' : ''}
      `}
    >
      {/* Selection checkbox overlay */}
      {selectionMode && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
          <div
            className={`
              w-6 h-6 rounded-full border-2 flex items-center justify-center
              transition-all duration-150
              ${multiSelected
                ? 'bg-primary-500 border-primary-500 text-white'
                : 'border-neutral-300 bg-white'
              }
            `}
          >
            {multiSelected && <Check className="w-4 h-4" />}
          </div>
        </div>
      )}

      {/* Content wrapper */}
      <div className="relative">
        {/* Main row: checkbox | title | actions | avatar */}
        <div className="flex items-center gap-4">
          {/* Checkbox - refined style */}
          <div className="w-6 shrink-0 flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onUpdate({ completed: !task.completed })
              }}
              onMouseDown={stopAllPropagation.onMouseDown}
              onMouseUp={stopAllPropagation.onMouseUp}
              onTouchStart={stopAllPropagation.onTouchStart}
              onTouchEnd={stopAllPropagation.onTouchEnd}
              className="touch-target flex items-center justify-center -m-2 p-2 group/check"
            >
              <span
                className={`
                  w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200
                  ${task.completed
                    ? 'bg-primary-500 border-primary-500 text-white shadow-sm'
                    : 'border-neutral-300 group-hover/check:border-primary-400 group-hover/check:bg-primary-50 group-hover/check:scale-105'
                  }
                `}
              >
                {task.completed && (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
            </button>
          </div>

          {/* Title and category */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span
              className={`text-left min-w-0 text-base line-clamp-2 transition-colors duration-200 ${
                task.completed
                  ? 'text-neutral-400 line-through'
                  : 'text-neutral-800 font-medium group-hover:text-neutral-900'
              }`}
            >
              {task.title}
            </span>
            {/* Category chip - only show for non-task categories */}
            {task.category && task.category !== 'task' && (
              <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-600 rounded-lg text-xs font-medium">
                {task.category === 'errand' && '🚗'}
                {task.category === 'chore' && '🧹'}
                {task.category === 'event' && '📅'}
                {task.category === 'activity' && '⚽'}
                <span className="hidden sm:inline">{task.category}</span>
              </span>
            )}
            {/* Age indicator - shows for tasks > 3 days old */}
            <AgeIndicator createdAt={task.createdAt} size="sm" />
          </div>

          {/* Action buttons - hidden by default, show on hover */}
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" {...stopAllPropagation}>
            {/* Review button */}
            {onTriage && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onTriage()
                }}
                className="p-2 rounded-xl text-neutral-300 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200"
                title="Review"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </button>
            )}

            {/* Schedule button */}
            <SchedulePopover
              value={task.scheduledFor}
              isAllDay={task.isAllDay}
              onSchedule={handleSchedule}
              onClear={() => onUpdate({ scheduledFor: undefined, isAllDay: undefined })}
              getItemsForDate={getScheduleItemsForDate}
            />

            {/* Defer/Later button */}
            <DeferPicker
              deferredUntil={task.deferredUntil}
              deferCount={task.deferCount}
              onDefer={onDefer}
            />
          </div>

          {/* Assignee avatar - always visible */}
          {familyMembers.length > 0 && onAssignTask && (
            <div className="shrink-0" {...stopAllPropagation}>
              <AssigneeDropdown
                members={familyMembers}
                selectedId={task.assignedTo}
                onSelect={onAssignTask}
                size="sm"
              />
            </div>
          )}
        </div>

        {/* Chips row - desktop only, only show if project exists */}
        {project && (
          <div className="hidden md:flex items-center gap-2 mt-2 ml-10 flex-wrap" {...stopAllPropagation}>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 text-blue-700 text-xs font-medium backdrop-blur-sm max-w-[160px]">
              <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              {onOpenProject ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenProject(project.id)
                  }}
                  className="truncate hover:underline transition-colors duration-150"
                >
                  {project.name}
                </button>
              ) : (
                <span className="truncate">{project.name}</span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUpdate({ projectId: undefined })
                }}
                className="ml-0.5 hover:text-blue-900 shrink-0 transition-colors duration-150"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
