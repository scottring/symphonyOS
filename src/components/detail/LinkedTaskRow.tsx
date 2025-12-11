import type { Task } from '@/types/task'

interface LinkedTaskRowProps {
  task: Task
  onToggle?: (taskId: string) => void
  onDelete?: (taskId: string) => void
}

/**
 * LinkedTaskRow component for prep/follow-up tasks
 */
export function LinkedTaskRow({ task, onToggle, onDelete }: LinkedTaskRowProps) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 group transition-colors">
      <button
        onClick={() => onToggle?.(task.id)}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
          task.completed
            ? 'bg-primary-500 border-primary-500'
            : 'border-neutral-300 hover:border-primary-400'
        }`}
      >
        {task.completed && (
          <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      <span className={`flex-1 text-sm ${task.completed ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
        {task.title}
      </span>

      {task.scheduledFor ? (
        <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
          {task.scheduledFor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      ) : (
        <button className="text-xs text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
          + Add to Today
        </button>
      )}

      {onDelete && (
        <button
          onClick={() => onDelete(task.id)}
          className="text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
}
