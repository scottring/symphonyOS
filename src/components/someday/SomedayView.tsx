import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { AssigneeDropdown } from '@/components/family'

interface SomedayViewProps {
  tasks: Task[]
  onMoveToInbox: (taskId: string) => void
  onSchedule: (taskId: string, date: Date, isAllDay: boolean) => void
  onDelete: (taskId: string) => void
  onSelectTask: (taskId: string) => void
  projects?: Project[]
  familyMembers?: FamilyMember[]
  onAssignTask?: (taskId: string, memberId: string | null) => void
}

/**
 * SomedayView - Shows all tasks marked as "someday/maybe"
 *
 * These are items that aren't urgent but shouldn't be deleted.
 * Users can review them periodically and either schedule them,
 * move them back to inbox, or delete them.
 */
export function SomedayView({
  tasks,
  onMoveToInbox,
  onSchedule,
  onDelete,
  onSelectTask,
  projects = [],
  familyMembers = [],
  onAssignTask,
}: SomedayViewProps) {
  // Filter to only someday tasks
  const somedayTasks = useMemo(() => {
    return tasks.filter(t => t.isSomeday && !t.completed)
  }, [tasks])

  // Group by project
  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {
      unassigned: [],
    }

    somedayTasks.forEach(task => {
      if (task.projectId) {
        if (!groups[task.projectId]) {
          groups[task.projectId] = []
        }
        groups[task.projectId].push(task)
      } else {
        groups.unassigned.push(task)
      }
    })

    return groups
  }, [somedayTasks])

  const projectIds = Object.keys(groupedTasks).filter(
    id => id !== 'unassigned' && groupedTasks[id].length > 0
  )

  if (somedayTasks.length === 0) {
    return (
      <div className="px-4 py-4 md:p-8 max-w-2xl mx-auto">
        <header className="mb-8">
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-neutral-900">
            Someday / Maybe
          </h1>
          <p className="text-neutral-600 mt-1">
            Items you might do someday, but not now.
          </p>
        </header>

        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-neutral-100 flex items-center justify-center">
            <span className="text-3xl">💭</span>
          </div>
          <p className="font-display text-xl text-neutral-700 mb-2">No someday items</p>
          <p className="text-neutral-500">
            When triaging, choose "Someday" for non-urgent ideas.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 md:p-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-neutral-900">
          Someday / Maybe
        </h1>
        <p className="text-neutral-600 mt-1">
          {somedayTasks.length} item{somedayTasks.length !== 1 ? 's' : ''} for future consideration
        </p>
      </header>

      <div className="space-y-8">
        {/* Unassigned items */}
        {groupedTasks.unassigned.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3">
              No Project
            </h2>
            <div className="space-y-2">
              {groupedTasks.unassigned.map(task => (
                <SomedayTaskCard
                  key={task.id}
                  task={task}
                  onMoveToInbox={() => onMoveToInbox(task.id)}
                  onScheduleToday={() => {
                    const today = new Date()
                    today.setHours(9, 0, 0, 0)
                    onSchedule(task.id, today, true)
                  }}
                  onDelete={() => onDelete(task.id)}
                  onClick={() => onSelectTask(task.id)}
                  familyMembers={familyMembers}
                  onAssign={onAssignTask ? (memberId) => onAssignTask(task.id, memberId) : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* Grouped by project */}
        {projectIds.map(projectId => {
          const project = projects.find(p => p.id === projectId)
          const projectTasks = groupedTasks[projectId]

          return (
            <section key={projectId}>
              <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="text-blue-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                </span>
                {project?.name || 'Unknown Project'}
              </h2>
              <div className="space-y-2">
                {projectTasks.map(task => (
                  <SomedayTaskCard
                    key={task.id}
                    task={task}
                    onMoveToInbox={() => onMoveToInbox(task.id)}
                    onScheduleToday={() => {
                      const today = new Date()
                      today.setHours(9, 0, 0, 0)
                      onSchedule(task.id, today, true)
                    }}
                    onDelete={() => onDelete(task.id)}
                    onClick={() => onSelectTask(task.id)}
                    familyMembers={familyMembers}
                    onAssign={onAssignTask ? (memberId) => onAssignTask(task.id, memberId) : undefined}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

interface SomedayTaskCardProps {
  task: Task
  onMoveToInbox: () => void
  onScheduleToday: () => void
  onDelete: () => void
  onClick: () => void
  familyMembers?: FamilyMember[]
  onAssign?: (memberId: string | null) => void
}

function SomedayTaskCard({
  task,
  onMoveToInbox,
  onScheduleToday,
  onDelete,
  onClick,
  familyMembers = [],
  onAssign,
}: SomedayTaskCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-neutral-100 px-4 py-3 shadow-sm cursor-pointer hover:border-primary-200 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-8 h-8 rounded-lg bg-sage-50 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-lg">💭</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-neutral-800 line-clamp-2">
            {task.title}
          </p>
          {task.notes && (
            <p className="text-sm text-neutral-500 mt-1 line-clamp-1">
              {task.notes}
            </p>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Move to Inbox */}
          <button
            onClick={onMoveToInbox}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            title="Move to Inbox"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </button>

          {/* Schedule Today */}
          <button
            onClick={onScheduleToday}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
            title="Schedule for Today"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Delete */}
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* Assignee */}
        {familyMembers.length > 0 && onAssign && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <AssigneeDropdown
              members={familyMembers}
              selectedId={task.assignedTo}
              onSelect={onAssign}
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default SomedayView
