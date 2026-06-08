import { useState, useRef, useEffect } from 'react'
import { PanelMoreMenu } from './PanelMoreMenu'
import { ConceptIcon } from '@/lib/conceptIcons'
import { RescheduleGrid } from '@/components/schedule/RescheduleGrid'
import type { TriageWhen } from '@/components/schedule/TriageWhenMenu'

interface PanelActionsProps {
  completed: boolean
  phoneNumber?: string
  location?: string
  scheduledFor?: Date
  isAllDay?: boolean
  isPinned: boolean
  onToggleComplete: () => void
  onShowDirections?: () => void
  /** Schedule a specific date/time (the "Pick date" path). */
  onSchedule: (date: Date, isAllDay: boolean) => void
  /** Relative reschedule (today / weekend / this week / someday …). */
  onReschedule?: (when: TriageWhen) => void
  onClearSchedule?: () => void
  onTogglePin: () => void
  onDelete: () => void
  /** Group-wrapper actions, forwarded to the more-menu (present only for a task with subtasks). */
  onUngroup?: () => void
  onDeleteGroup?: () => void
}

export function PanelActions({
  completed,
  phoneNumber,
  location,
  scheduledFor,
  isPinned,
  onToggleComplete,
  onShowDirections,
  onSchedule,
  onReschedule,
  onClearSchedule,
  onTogglePin,
  onDelete,
  onUngroup,
  onDeleteGroup,
}: PanelActionsProps) {
  const [schedOpen, setSchedOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!schedOpen) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setSchedOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [schedOpen])

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={onToggleComplete}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
      >
        {completed ? '↺ Reopen' : <><ConceptIcon name="done" decorative /> Done</>}
      </button>
      {phoneNumber && (
        <a
          href={`tel:${phoneNumber}`}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          <ConceptIcon name="call" decorative /> {phoneNumber}
        </a>
      )}
      {location && onShowDirections && (
        <button
          onClick={onShowDirections}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          <ConceptIcon name="location" decorative /> Directions
        </button>
      )}

      {/* Schedule — the same one-tap icon grid used across the app (applies
          immediately; no two-step date→time popover). */}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setSchedOpen((o) => !o)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
        >
          <ConceptIcon name="when" decorative /> Schedule
        </button>
        {schedOpen && (
          <div className="absolute left-0 z-50 mt-1 w-80 p-2 bg-white rounded-xl border border-neutral-200 shadow-lg">
            <div className="px-1 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">Schedule for</div>
            <RescheduleGrid
              onPick={(when) => { setSchedOpen(false); onReschedule?.(when) }}
              onPickDate={(date, isAllDay) => { setSchedOpen(false); onSchedule(date, isAllDay) }}
            />
            {scheduledFor && onClearSchedule && (
              <button
                type="button"
                onClick={() => { setSchedOpen(false); onClearSchedule() }}
                className="mt-2 w-full text-left px-3 py-2 rounded-lg text-sm text-neutral-500 hover:bg-neutral-50"
              >
                Clear schedule
              </button>
            )}
          </div>
        )}
      </div>

      <PanelMoreMenu
        isPinned={isPinned}
        onTogglePin={onTogglePin}
        onDelete={onDelete}
        onUngroup={onUngroup}
        onDeleteGroup={onDeleteGroup}
      />
    </div>
  )
}
