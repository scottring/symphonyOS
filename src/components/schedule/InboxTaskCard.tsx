import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import { WhenPicker, ContextPicker, AssignPicker, PushDropdown } from '@/components/triage'

interface InboxTaskCardProps {
  task: Task
  onUpdate: (updates: Partial<Task>) => void
  onPush: (date: Date) => void
  onSelect: () => void
  projects?: Project[]
  contacts?: Contact[]
  onSearchContacts?: (query: string) => Contact[]
}

export function InboxTaskCard({
  task,
  onUpdate,
  onPush,
  onSelect,
  projects = [],
  contacts = [],
  onSearchContacts,
}: InboxTaskCardProps) {
  const project = projects.find(p => p.id === task.projectId)
  const assignee = contacts.find(c => c.id === task.assignedTo)
  const showDeferBadge = (task.deferCount ?? 0) >= 2

  return (
    <div className="bg-white rounded-xl border border-neutral-100 px-3 py-2.5 shadow-sm">
      {/* Main row: checkbox | title | triage icons */}
      <div className="flex items-center gap-3">
        {/* Checkbox - fixed width to align with ScheduleItem */}
        <div className="w-5 shrink-0 flex items-center justify-center">
          <button
            onClick={() => onUpdate({ completed: !task.completed })}
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

        {/* Title - clickable to open detail */}
        <button
          onClick={onSelect}
          className={`flex-1 text-left min-w-0 text-base font-medium line-clamp-2 ${
            task.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'
          } hover:text-primary-600 transition-colors`}
        >
          {task.title}
        </button>

        {/* Triage icons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <WhenPicker
            value={task.scheduledFor}
            isAllDay={task.isAllDay}
            onChange={(date, isAllDay) => onUpdate({ scheduledFor: date, isAllDay, deferredUntil: undefined })}
          />
          <PushDropdown onPush={onPush} />
          <ContextPicker
            value={task.context}
            onChange={(context) => onUpdate({ context })}
          />
          <AssignPicker
            value={task.assignedTo}
            contacts={contacts}
            onSearchContacts={onSearchContacts}
            onChange={(assignedTo) => onUpdate({ assignedTo })}
          />
        </div>
      </div>

      {/* Chips row - desktop only */}
      {(project || assignee || showDeferBadge) && (
        <div className="hidden md:flex items-center gap-2 mt-1.5 ml-8 flex-wrap">
          {project && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs max-w-[140px]">
              <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <span className="truncate">{project.name}</span>
              <button
                onClick={() => onUpdate({ projectId: undefined })}
                className="ml-0.5 hover:text-blue-900 shrink-0"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </span>
          )}
          {assignee && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs max-w-[100px]">
              <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              <span className="truncate">{assignee.name}</span>
              <button
                onClick={() => onUpdate({ assignedTo: undefined })}
                className="ml-0.5 hover:text-purple-900 shrink-0"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </span>
          )}
          {showDeferBadge && (
            <span className="text-xs text-amber-600 font-medium">
              ↻{task.deferCount}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
