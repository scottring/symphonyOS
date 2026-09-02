// src/components/schedule/RescheduleButton.tsx
//
// A dedicated one-tap reschedule control for a Today task row: a calendar icon
// that opens straight into the WHEN list (no '...' menu, no detail pane, no
// time-picker step). Picking a target applies immediately via the shared
// applyTriageWhen + the schedule-actions context, so it actually persists.

import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Portal + fixed positioning (the PushDropdown/TaskFateMenu pattern). An
  // absolutely-positioned grid is clipped by any scrolling ancestor, and this
  // control is now hosted inside one: EmailReviewSheet's body is
  // `max-h-[85vh] overflow-auto`, so the grid was cut off at the sheet's edge.
  // Measured and placed by direct style mutation (the DOM is the external
  // system here — no setState, no cascading render), clamped to the viewport
  // and flipped above when the bottom is tight. No dep array: every render
  // resets the JSX style to hidden, so every render must re-place before paint.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!trigger || !panel) return
    const w = panel.offsetWidth
    const h = panel.offsetHeight
    const left = Math.max(8, Math.min(trigger.right - w, window.innerWidth - w - 8))
    const below = trigger.bottom + 4
    const top = below + h > window.innerHeight - 8 && trigger.top - h - 4 > 8
      ? trigger.top - h - 4
      : below
    panel.style.top = `${top}px`
    panel.style.left = `${left}px`
    panel.style.visibility = 'visible'
  })

  const reschedule = useCallback((when: TriageWhen) => {
    const taskId = item.originalTask?.id
    if (taskId) {
      void (async () => {
        const ok = await applyTriageWhen(when, taskId, {
          onPushTask: (id, target) => ctx.onPushTask?.(id, target),
          onSetBucket: (id, bucket) => ctx.onUpdateTask?.(id, { bucket, scheduledFor: undefined, isAllDay: undefined }),
        })
        // A cancelled domain gate writes nothing — no confirmation for a move
        // that didn't happen.
        if (ok) showToast(describeTriageWhen(when), 'success')
      })()
    }
    setOpen(false)
  }, [item.originalTask, ctx])

  const rescheduleToDate = useCallback((date: Date, isAllDay: boolean) => {
    const taskId = item.originalTask?.id
    if (taskId) {
      void (async () => {
        const result = await ctx.onUpdateTask?.(taskId, { bucket: 'timed', scheduledFor: date, isAllDay })
        if (result === false) return
        const label = isAllDay
          ? formatDateLabel(date)
          : `${formatDateLabel(date)}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
        showToast(`Moved to ${label}`, 'success')
      })()
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
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
      >
        <CalendarClock className="w-4 h-4" />
      </button>

      {open && createPortal(
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-[99] cursor-default"
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
          />
          <div
            ref={panelRef}
            role="menu"
            style={{ top: 0, left: 0, visibility: 'hidden' }}
            className="fixed z-[100] w-80 p-2 bg-white rounded-xl border border-neutral-200 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-1 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">Reschedule to</div>
            <RescheduleGrid onPick={reschedule} onPickDate={rescheduleToDate} />
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
