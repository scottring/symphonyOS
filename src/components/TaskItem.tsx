import { useState } from 'react'
import type { Task } from '@/types/task'
import { TaskDetail } from './TaskDetail'

interface TaskItemProps {
  task: Task
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<Task>) => void
}

export function TaskItem({ task, onToggle, onDelete, onUpdate }: TaskItemProps) {
  const [expanded, setExpanded] = useState(false)

  const hasContext = task.notes || task.phoneNumber || (task.links && task.links.length > 0)

  return (
    <li className="bg-white rounded-lg shadow-card p-4">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(task.id)}
          className="w-5 h-5 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
        />
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex-1 text-left ${
            task.completed ? 'line-through text-neutral-400' : 'text-neutral-800'
          }`}
        >
          <span>{task.title}</span>
          {hasContext && (
            <span className="ml-2 text-xs text-primary-500">*</span>
          )}
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-neutral-400 hover:text-neutral-600 transition-colors"
          aria-label={expanded ? 'Collapse task' : 'Expand task'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="text-neutral-400 hover:text-red-500 transition-colors"
          aria-label="Delete task"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      {expanded && <TaskDetail task={task} onUpdate={onUpdate} />}
    </li>
  )
}
