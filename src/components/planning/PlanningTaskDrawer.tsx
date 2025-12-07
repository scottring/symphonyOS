import { useDroppable } from '@dnd-kit/core'
import type { Task } from '@/types/task'
import { PlanningTaskCard } from './PlanningTaskCard'

interface PlanningTaskDrawerProps {
  tasks: Task[]
  onPushTask: (id: string, date: Date) => void
}

export function PlanningTaskDrawer({ tasks, onPushTask }: PlanningTaskDrawerProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'unscheduled-drawer',
  })

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 border-r flex flex-col transition-colors ${
        isOver
          ? 'bg-primary-100 border-primary-300'
          : 'bg-neutral-50 border-neutral-200'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-neutral-200">
        <h2 className="font-medium text-neutral-700 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 text-neutral-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
          </svg>
          Unscheduled
          {tasks.length > 0 && (
            <span className="ml-auto text-sm text-neutral-500 bg-neutral-200 px-2 py-0.5 rounded-full">
              {tasks.length}
            </span>
          )}
        </h2>
        <p className="text-xs text-neutral-500 mt-1">
          Drag to schedule
        </p>
      </div>

      {/* Task list - overflow-x-clip allows dropdown to show while y scrolls */}
      <div className="flex-1 overflow-y-auto overflow-x-clip p-3 space-y-2">
        {tasks.length === 0 ? (
          <div className={`text-center py-8 ${isOver ? 'opacity-50' : ''}`}>
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-neutral-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6 text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-sm text-neutral-500">
              {isOver ? 'Drop to unschedule' : 'All tasks scheduled'}
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <PlanningTaskCard 
              key={task.id} 
              task={task} 
              onPushTask={onPushTask}
            />
          ))
        )}
      </div>

      {/* Footer with help text */}
      <div className="p-3 border-t border-neutral-200 bg-neutral-100/50">
        <div className="flex items-start gap-2 text-xs text-neutral-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4 shrink-0 mt-0.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            Drag tasks onto the calendar to schedule. Drag back here to unschedule.
          </span>
        </div>
      </div>
    </div>
  )
}
