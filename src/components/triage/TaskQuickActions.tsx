import type { Task, TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { SchedulePopover, type ScheduleContextItem } from './SchedulePopover'
import { ContextPicker } from './ContextPicker'
import { AssigneeDropdown } from '@/components/family'

interface TaskQuickActionsProps {
  task: Task
  // Schedule action
  onSchedule?: (date: Date | undefined, isAllDay: boolean) => void
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  // Context action
  onContextChange?: (context: TaskContext | undefined) => void
  // Assign action
  familyMembers?: FamilyMember[]
  onAssign?: (memberId: string | null) => void
  // Layout
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Reusable quick-action icons for tasks: Schedule, Context, Assign
 * Used across all task card variants to maintain first-class citizen status
 */
export function TaskQuickActions({
  task,
  onSchedule,
  getScheduleItemsForDate,
  onContextChange,
  familyMembers = [],
  onAssign,
  size = 'sm',
  className = '',
}: TaskQuickActionsProps) {
  const hasSchedule = !!onSchedule
  const hasContext = !!onContextChange
  const hasAssign = familyMembers.length > 0 && !!onAssign

  // Don't render if no actions available
  if (!hasSchedule && !hasContext && !hasAssign) {
    return null
  }

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Schedule/When picker */}
      {hasSchedule && (
        <SchedulePopover
          value={task.scheduledFor ?? undefined}
          isAllDay={task.isAllDay}
          onSchedule={(date, isAllDay) => onSchedule(date, isAllDay)}
          onClear={() => onSchedule(undefined, false)}
          getItemsForDate={getScheduleItemsForDate}
          trigger={
            <button
              className={`
                ${size === 'sm' ? 'p-1.5' : 'p-2'} rounded-lg transition-colors
                ${task.scheduledFor
                  ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                  : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                }
              `}
              aria-label="Schedule task"
            >
              <svg
                className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
          }
        />
      )}

      {/* Context picker */}
      {hasContext && (
        <ContextPicker
          value={task.context}
          onChange={onContextChange}
        />
      )}

      {/* Assignee dropdown */}
      {hasAssign && (
        <AssigneeDropdown
          members={familyMembers}
          selectedId={task.assignedTo}
          onSelect={onAssign}
          size={size}
        />
      )}
    </div>
  )
}
