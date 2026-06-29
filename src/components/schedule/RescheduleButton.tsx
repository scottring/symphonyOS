// src/components/schedule/RescheduleButton.tsx
//
// A dedicated one-tap reschedule control for a Today task row: a calendar icon
// that opens straight into the WHEN list (no '...' menu, no detail pane, no
// time-picker step). Picking a target applies immediately via the shared
// applyTriageWhen + the schedule-actions context, so it actually persists.

import { useState, useRef, useCallback } from 'react'
import { CalendarClock } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { applyTriageWhen, describeTriageWhen } from '@/lib/triage/applyWhen'
import { formatDateLabel } from '@/lib/dateHelpers'
import { showToast } from '@/hooks/useToast'
import type { TriageWhen } from './TriageWhenMenu'
import { RescheduleGrid } from './RescheduleGrid'

export function RescheduleButton({ item }: { item: TimelineItem }) {
  const ctx = useScheduleActionsContext()
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const reschedule = useCallback((when: TriageWhen) => {
    const taskId = item.originalTask?.id
    if (taskId) {
      applyTriageWhen(when, taskId, {
        onPushTask: (id, target) => ctx.onPushTask?.(id, target),
        onSetBucket: (id, bucket) => ctx.onUpdateTask?.(id, { bucket, scheduledFor: undefined, isAllDay: undefined }),
      })
      // Confirm where it landed — the dated label removes any "which weekend?" doubt.
      showToast(describeTriageWhen(when), 'success')
    }
    setOpen(false)
  }, [item.originalTask, ctx])

  const rescheduleToDate = useCallback((date: Date, isAllDay: boolean) => {
    const taskId = item.originalTask?.id
    if (taskId) {
      ctx.onUpdateTask?.(taskId, { bucket: 'timed', scheduledFor: date, isAllDay })
      const label = isAllDay
        ? formatDateLabel(date)
        : `${formatDateLabel(date)}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      showToast(`Moved to ${label}`, 'success')
    }
    setOpen(false)
  }, [item.originalTask, ctx])

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Reschedule"
        title="Reschedule"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          if (!open) {
            const rect = triggerRef.current?.getBoundingClientRect()
            setOpenUp(rect ? window.innerHeight - rect.bottom < 320 : false)
          }
          setOpen((o) => !o)
        }}
        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
      >
        <CalendarClock className="w-4 h-4" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
          />
          <div
            role="menu"
            className={`absolute right-0 z-50 w-80 p-2 bg-white rounded-xl border border-neutral-200 shadow-lg ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          >
            <div className="px-1 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">Reschedule to</div>
            <RescheduleGrid onPick={reschedule} onPickDate={rescheduleToDate} />
          </div>
        </>
      )}
    </div>
  )
}
