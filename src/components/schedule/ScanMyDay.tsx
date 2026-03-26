import { useState } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

interface ScanMyDayProps {
  tasks: Task[]
  events: CalendarEvent[]
}

function isMorningHours(): boolean {
  const hour = new Date().getHours()
  return hour >= 6 && hour < 9
}

export function ScanMyDay({ tasks, events }: ScanMyDayProps) {
  const [collapsed, setCollapsed] = useState(false)

  const taskCount = tasks.length
  const eventCount = events.length

  // Only show during morning hours
  if (!isMorningHours()) return null

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50/50 border border-amber-100/50 hover:bg-amber-50/80 transition-colors mb-4"
      >
        <span className="text-amber-500 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
          </svg>
        </span>
        <span className="text-xs text-neutral-400">
          {taskCount} tasks, {eventCount} events
        </span>
      </button>
    )
  }

  return (
    <div className="mb-6 animate-fade-in-up">
      <div className="rounded-2xl border border-amber-200/50 bg-gradient-to-br from-amber-50/80 to-orange-50/40 p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-neutral-800">
              Good morning
            </h3>
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-white/60 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Counts */}
        <div className="flex gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary-400" />
            <span className="text-sm text-neutral-600">
              <span className="font-semibold tabular-nums">{taskCount}</span> task{taskCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-sm text-neutral-600">
              <span className="font-semibold tabular-nums">{eventCount}</span> event{eventCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
