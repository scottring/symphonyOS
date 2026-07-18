// src/components/planning/horizon/MonthZoomSheet.tsx
//
// Zoom into a single month without leaving the year landscape. A dismissible
// overlay that floats the full MonthCalendarGrid over whatever's behind it
// (the /year page grid, or the annual session's mountain-ranges step) — the
// caller stays mounted underneath, so dismissing returns you exactly where you
// were. Interactive on the /year page (drag to place/unschedule); read-only in
// the guided session, where "look, don't link" forbids scheduling here.
import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { MonthCalendarGrid } from './MonthCalendarGrid'

interface MonthZoomSheetProps {
  /** Any date within the month to show. */
  month: Date
  tasks: Task[]
  events: CalendarEvent[]
  onClose: () => void
  readOnly?: boolean
  onPlaceTask?: (taskId: string, day: Date) => void
  onUnscheduleTask?: (taskId: string) => void
  onSelectTask?: (taskId: string) => void
}

export function MonthZoomSheet({
  month, tasks, events, onClose, readOnly = false, onPlaceTask, onUnscheduleTask, onSelectTask,
}: MonthZoomSheetProps) {
  // Escape closes — matches the app's other overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-900/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-5"
        role="dialog"
        aria-label={`${label} calendar`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-neutral-400">Zoom in</p>
            <h2 className="font-display text-2xl text-neutral-800">{label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <MonthCalendarGrid
          month={month}
          tasks={tasks}
          events={events}
          readOnly={readOnly}
          onPlaceTask={onPlaceTask}
          onUnscheduleTask={onUnscheduleTask}
          onSelectTask={onSelectTask}
        />
      </div>
    </div>
  )
}
