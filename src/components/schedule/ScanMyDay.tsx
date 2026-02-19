import { useState, useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { PlaybookInstance, DayType } from '@/types/playbook'
import { QUICK_REACT_CONFIG } from '@/types/playbook'

const DAY_TYPE_LABELS: Record<DayType, string> = {
  'school-day': 'School Day',
  'weekend': 'Weekend',
  'holiday': 'Holiday',
  'half-day': 'Half Day',
}

const DAY_TYPE_OPTIONS: DayType[] = ['school-day', 'weekend', 'holiday', 'half-day']

interface ScanMyDayProps {
  tasks: Task[]
  events: CalendarEvent[]
  playbookInstances: PlaybookInstance[]
  onReviewYesterday?: () => void
  dayType?: DayType
  onDayTypeChange?: (dayType: DayType) => void
}

function isMorningHours(): boolean {
  const hour = new Date().getHours()
  return hour >= 6 && hour < 9
}

export function ScanMyDay({
  tasks,
  events,
  playbookInstances,
  onReviewYesterday,
  dayType: dayTypeProp,
  onDayTypeChange,
}: ScanMyDayProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showDayTypePicker, setShowDayTypePicker] = useState(false)

  // Use prop or auto-detect
  const today = new Date()
  const dayOfWeek = today.getDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const effectiveDayType = dayTypeProp ?? (isWeekend ? 'weekend' as const : 'school-day' as const)
  const dayTypeLabel = DAY_TYPE_LABELS[effectiveDayType]

  // Count today's items
  const taskCount = tasks.length
  const eventCount = events.length
  const coachingCount = playbookInstances.length

  // Yesterday's flagged blocks (tough reacts)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const flaggedYesterday = useMemo(() => {
    return playbookInstances.filter(
      i => i.date === yesterdayStr && i.react === 'tough'
    )
  }, [playbookInstances, yesterdayStr])

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
        <span className="text-xs font-medium text-amber-700">{dayTypeLabel}</span>
        <span className="text-xs text-neutral-400">
          {taskCount} tasks, {eventCount} events
          {coachingCount > 0 && `, ${coachingCount} coaching`}
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
            <div className="text-sm text-neutral-500 mt-0.5 relative">
              It's a{' '}
              {onDayTypeChange ? (
                <button
                  onClick={() => setShowDayTypePicker(!showDayTypePicker)}
                  className="inline-flex items-center gap-1 font-medium text-amber-700 hover:text-amber-800 transition-colors border-b border-dashed border-amber-300"
                >
                  {dayTypeLabel.toLowerCase()}
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              ) : (
                <span className="font-medium text-amber-700">{dayTypeLabel.toLowerCase()}</span>
              )}

              {/* Day type picker dropdown */}
              {showDayTypePicker && onDayTypeChange && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowDayTypePicker(false)}
                  />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 min-w-[140px]">
                    {DAY_TYPE_OPTIONS.map((dt) => (
                      <button
                        key={dt}
                        onClick={() => {
                          onDayTypeChange(dt)
                          setShowDayTypePicker(false)
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                          dt === effectiveDayType
                            ? 'bg-amber-50 text-amber-700 font-medium'
                            : 'text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        {DAY_TYPE_LABELS[dt]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
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
          {coachingCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-sm text-neutral-600">
                <span className="font-semibold tabular-nums">{coachingCount}</span> coaching
              </span>
            </div>
          )}
        </div>

        {/* Flagged blocks from yesterday */}
        {flaggedYesterday.length > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-200/40">
            <p className="text-xs font-medium text-amber-600 mb-2">
              Yesterday had {flaggedYesterday.length} tough moment{flaggedYesterday.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-1">
              {flaggedYesterday.map(instance => (
                <div
                  key={instance.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <span>{QUICK_REACT_CONFIG['tough'].emoji}</span>
                  <span className="text-neutral-600">{instance.block?.label || 'Block'}</span>
                </div>
              ))}
            </div>
            {onReviewYesterday && (
              <button
                onClick={onReviewYesterday}
                className="mt-2 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
              >
                Review yesterday →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
