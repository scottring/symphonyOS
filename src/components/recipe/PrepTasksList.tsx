import { useState } from 'react'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { formatTime } from '@/lib/timeUtils'
import { TaskQuickActions, type ScheduleContextItem } from '@/components/triage'

interface PrepTasksListProps {
  prepTasks: Task[]
  eventTime: Date
  onAddPrepTask: (title: string, scheduledFor: Date) => Promise<string | undefined>
  onTogglePrepTask: (taskId: string) => void
  onOpenTask?: (taskId: string) => void
  // Quick action props
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
  familyMembers?: FamilyMember[]
}

/**
 * List of prep tasks linked to a meal event
 * Shows existing prep tasks and allows adding new ones
 */
export function PrepTasksList({
  prepTasks,
  eventTime,
  onAddPrepTask,
  onTogglePrepTask,
  onOpenTask,
  onUpdateTask,
  getScheduleItemsForDate,
  familyMembers = [],
}: PrepTasksListProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskTime, setNewTaskTime] = useState(() => {
    // Default to 3 hours before event
    const defaultTime = new Date(eventTime)
    defaultTime.setHours(defaultTime.getHours() - 3)
    return defaultTime
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim() || isSubmitting) return

    setIsSubmitting(true)
    await onAddPrepTask(newTaskTitle.trim(), newTaskTime)
    setNewTaskTitle('')
    setIsAdding(false)
    setIsSubmitting(false)
  }

  // Sort prep tasks by scheduled time
  const sortedPrepTasks = [...prepTasks].sort((a, b) => {
    const aTime = a.scheduledFor?.getTime() || 0
    const bTime = b.scheduledFor?.getTime() || 0
    return aTime - bTime
  })

  return (
    <div className="mt-4 pt-4 border-t border-neutral-100">
      <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
        Prep Tasks
      </h4>

      {/* Existing prep tasks */}
      {sortedPrepTasks.length > 0 && (
        <div className="space-y-2 mb-3">
          {sortedPrepTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 group"
            >
              {/* Checkbox */}
              <button
                onClick={() => onTogglePrepTask(task.id)}
                className={`
                  w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors
                  ${task.completed
                    ? 'bg-primary-500 border-primary-500 text-white'
                    : 'border-neutral-300 hover:border-primary-400'
                  }
                `}
              >
                {task.completed && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              {/* Task info */}
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onOpenTask?.(task.id)}
              >
                <p className={`text-sm truncate ${task.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
                  {task.title}
                </p>
              </div>

              {/* Quick Actions */}
              {onUpdateTask && (
                <TaskQuickActions
                  task={task}
                  onSchedule={(date, isAllDay) => {
                    onUpdateTask(task.id, { scheduledFor: date, isAllDay })
                  }}
                  getScheduleItemsForDate={getScheduleItemsForDate}
                  onContextChange={(context) => {
                    onUpdateTask(task.id, { context })
                  }}
                  familyMembers={familyMembers}
                  onAssign={(memberId) => {
                    onUpdateTask(task.id, { assignedTo: memberId ?? undefined })
                  }}
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              )}

              {/* Scheduled time */}
              {task.scheduledFor && (
                <span className="text-xs text-neutral-400 flex-shrink-0">
                  {formatTime(task.scheduledFor)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add prep task form */}
      {isAdding ? (
        <form onSubmit={handleAddTask} className="space-y-3">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="e.g., Defrost chicken"
            className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            autoFocus
            disabled={isSubmitting}
          />

          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500">Schedule for:</label>
            <input
              type="time"
              step="300"
              value={`${String(newTaskTime.getHours()).padStart(2, '0')}:${String(newTaskTime.getMinutes()).padStart(2, '0')}`}
              onChange={(e) => {
                const [hours, minutes] = e.target.value.split(':').map(Number)
                const newTime = new Date(eventTime)
                newTime.setHours(hours, minutes, 0, 0)
                setNewTaskTime(newTime)
              }}
              className="px-2 py-1 text-sm rounded border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false)
                setNewTaskTitle('')
              }}
              className="flex-1 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 rounded-lg transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newTaskTitle.trim() || isSubmitting}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded-lg border border-dashed border-neutral-200 hover:border-neutral-300 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add prep task
        </button>
      )}
    </div>
  )
}
