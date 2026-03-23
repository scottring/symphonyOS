import { useState, useCallback } from 'react'
import type { Task } from '@/types/task'

interface PullStripProps {
  inboxTasks: Task[]
  weekTasks: Task[]
  onPullToToday: (taskId: string) => void
  onSelectTask: (taskId: string) => void
}

const MAX_VISIBLE = 6

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
    </svg>
  )
}

export function PullStrip({ inboxTasks, weekTasks, onPullToToday, onSelectTask }: PullStripProps) {
  const [expanded, setExpanded] = useState(false)
  const totalCount = inboxTasks.length + weekTasks.length

  const handlePull = useCallback((e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    onPullToToday(taskId)
  }, [onPullToToday])

  if (totalCount === 0) return null

  // Combined list: inbox first (newest first), then week tasks
  const sortedInbox = [...inboxTasks].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  const combined = [...sortedInbox, ...weekTasks]
  const visible = combined.slice(0, MAX_VISIBLE)
  const overflow = totalCount - visible.length

  return (
    <div className="mb-3 md:mb-5 animate-fade-in-up">
      {/* Header — clickable to toggle */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-2 mb-1 px-1 py-1 -mx-1 rounded-lg hover:bg-neutral-100/60 transition-colors w-full text-left"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
          Pull into today
        </span>
        <span className="text-[11px] font-semibold text-neutral-300 tabular-nums">
          {totalCount}
        </span>
      </button>

      {/* Items — collapsible */}
      {expanded && (
        <div
          className="flex flex-col gap-1 max-h-[240px] overflow-y-auto animate-fade-in-up"
          style={{ scrollbarWidth: 'thin' }}
        >
          {visible.map((task) => {
            const isInbox = task.bucket === 'inbox'
            return (
              <div
                key={task.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-50/80 hover:bg-neutral-100 transition-colors group cursor-pointer"
                onClick={() => onSelectTask(task.id)}
              >
                {/* Source icon */}
                {isInbox ? (
                  <InboxIcon className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 ml-0.5 mr-0.5" />
                )}

                {/* Title */}
                <span className="text-sm text-neutral-700 flex-1 truncate">
                  {task.title}
                </span>

                {/* Pull button — always visible */}
                <button
                  onClick={(e) => handlePull(e, task.id)}
                  className="flex-shrink-0 px-2.5 py-1 rounded-md bg-primary-50 text-primary-600 text-xs font-semibold
                             hover:bg-primary-100 active:bg-primary-200 transition-colors"
                >
                  Today
                </button>
              </div>
            )
          })}

          {overflow > 0 && (
            <div className="text-center py-1">
              <span className="text-[11px] text-neutral-400">
                +{overflow} more
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
