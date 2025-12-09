import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import { DeferPicker, SchedulePopover } from '@/components/triage'
import { AssigneeDropdown } from '@/components/family'

interface InboxTaskCardProps {
  task: Task
  onDefer: (date: Date | undefined) => void
  onSchedule?: (date: Date, isAllDay: boolean) => void
  onUpdate: (updates: Partial<Task>) => void
  onSelect: () => void
  projects?: Project[]
  onOpenProject?: (projectId: string) => void
  // Family member assignment
  familyMembers?: FamilyMember[]
  onAssignTask?: (memberId: string | null) => void
}

export function InboxTaskCard({
  task,
  onDefer,
  onSchedule,
  onUpdate,
  onSelect,
  projects = [],
  onOpenProject,
  familyMembers = [],
  onAssignTask,
}: InboxTaskCardProps) {
  const project = projects.find(p => p.id === task.projectId)

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
      onClick={onSelect}
      className="bg-white rounded-xl border border-neutral-100 px-3 py-2.5 shadow-sm cursor-pointer hover:border-primary-200 hover:shadow-md transition-all group"
    >
      {/* Main row: checkbox | title | actions | avatar */}
      <div className="flex items-center gap-2.5">
        {/* Checkbox - fixed width to align with ScheduleItem */}
        <div className="w-5 shrink-0 flex items-center justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUpdate({ completed: !task.completed })
            }}
            className="touch-target flex items-center justify-center -m-2 p-2"
          >
            <span
              className={`
                w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
                ${task.completed
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'border-neutral-300 hover:border-primary-400'
                }
              `}
            >
              {task.completed && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
          </button>
        </div>

        {/* Title */}
        <span
          className={`flex-1 text-left min-w-0 text-base font-medium line-clamp-2 ${
            task.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'
          }`}
        >
          {task.title}
        </span>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Schedule button */}
          <SchedulePopover
            value={task.scheduledFor}
            isAllDay={task.isAllDay}
            onSchedule={handleSchedule}
            onClear={() => onUpdate({ scheduledFor: undefined, isAllDay: undefined })}
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
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
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
        <div className="hidden md:flex items-center gap-2 mt-1.5 ml-8 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs max-w-[140px]">
            <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            {onOpenProject ? (
              <button
                onClick={() => onOpenProject(project.id)}
                className="truncate hover:underline"
              >
                {project.name}
              </button>
            ) : (
              <span className="truncate">{project.name}</span>
            )}
            <button
              onClick={() => onUpdate({ projectId: undefined })}
              className="ml-0.5 hover:text-blue-900 shrink-0"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
