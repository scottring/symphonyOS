// src/components/schedule/RescheduleButton.tsx
//
// The Today task row's triage control: a calendar icon that opens straight
// into the contract's When group (lib/triage/contract.ts — Today … Someday,
// Pick date & time…, each naming where it lands), then "Skip this day" when
// the task is on the day in view, then Waiting. Picking applies at once via
// the shared applyTriageWhen + the schedule-actions context.

import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Hourglass, CircleSlash } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { triageTaskWhen, triageTaskDate, triageSkipDay } from '@/lib/triage/feedback'
import { SKIP_LABEL, SKIP_NOTE } from '@/lib/triage/contract'
import { isSameDay } from '@/lib/dateUtils'
import { showToast } from '@/hooks/useToast'
import type { TriageWhen } from './TriageWhenMenu'
import { RescheduleGrid } from './RescheduleGrid'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'
import { WaitingForPopover } from './WaitingForPopover'
import { waitingUpdates, CLEAR_WAITING, checkBackLabel } from '@/lib/today/waiting'

export function RescheduleButton({ item }: { item: TimelineItem }) {
  const ctx = useScheduleActionsContext()
  const [open, setOpen] = useState(false)
  // The same popover's second page: "I did my part — now I'm waiting on
  // someone." Lives beside the dates because it is the same question (when
  // does this come back?), and ticking was the only other way to say "not
  // mine to move right now" (Scott, 2026-10-01).
  const [waiting, setWaiting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => { setOpen(false); setWaiting(false) }, [])
  usePopoverFocus(open, triggerRef, panelRef, close)

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

  // The shared triage writes (lib/triage): the destination is confirmed only
  // after the write landed, with Undo; a write that did not land says so and
  // offers Retry, and the row stays where it was.
  const task = item.originalTask
  const reschedule = useCallback((when: TriageWhen) => {
    if (task) {
      void triageTaskWhen(task, when, {
        onPushTask: (id, target) => ctx.onPushTask?.(id, target),
        onSetBucket: (id, bucket) => ctx.onUpdateTask?.(id, { bucket, scheduledFor: undefined, isAllDay: undefined }),
        onUpdateTask: (id, updates) => ctx.onUpdateTask?.(id, updates),
        onFocus: (id, day) => ctx.onUpdateTask?.(id, { plannedOn: day }),
      })
    }
    setOpen(false)
  }, [task, ctx])

  const rescheduleToDate = useCallback((date: Date, isAllDay: boolean) => {
    if (task) void triageTaskDate(task, date, isAllDay, (id, updates) => ctx.onUpdateTask?.(id, updates))
    setOpen(false)
  }, [task, ctx])

  // Skip this day: only a task that is ON the day in view has a day to skip.
  const viewed = ctx.viewedDate ?? new Date()
  const onDay = !!task && (item.focused || (!!task.scheduledFor && isSameDay(task.scheduledFor, viewed)))
  const skipDay = useCallback(() => {
    if (task) void triageSkipDay(task, ctx.viewedDate ?? new Date(), (id, updates) => ctx.onUpdateTask?.(id, updates))
    setOpen(false)
  }, [task, ctx])

  const saveWaiting = useCallback((waitingFor: string, checkBack?: Date) => {
    const taskId = item.originalTask?.id
    if (taskId) {
      void (async () => {
        const result = await ctx.onUpdateTask?.(taskId, waitingUpdates(item, waitingFor, checkBack))
        if (result === false) return
        showToast(checkBack ? `Waiting — back ${checkBackLabel(checkBack)}` : 'Marked waiting', 'success')
      })()
    }
    close()
  }, [item, ctx, close])

  const clearWaiting = useCallback(() => {
    const taskId = item.originalTask?.id
    if (taskId) void ctx.onUpdateTask?.(taskId, CLEAR_WAITING)
    close()
  }, [item.originalTask, ctx, close])

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Reschedule"
        title="Reschedule"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setWaiting(false); setOpen((o) => !o) }}
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
            onClick={(e) => { e.stopPropagation(); close() }}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Reschedule to"
            style={{ top: 0, left: 0, visibility: 'hidden' }}
            className="fixed z-[100] w-80 max-w-[calc(100vw-16px)] max-h-[85dvh] overflow-y-auto p-2 bg-white rounded-xl border border-neutral-200 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {waiting ? (
              <div className="p-1">
                <WaitingForPopover
                  inline
                  initialValue={item.waitingFor}
                  taskId={item.originalTask?.id}
                  onSave={saveWaiting}
                  onClear={item.isWaiting ? clearWaiting : undefined}
                  onCancel={() => setWaiting(false)}
                />
              </div>
            ) : (
              <>
                <div className="px-1 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">When</div>
                <RescheduleGrid flexibleWeekend currentDay={onDay ? viewed : null} onPick={reschedule} onPickDate={rescheduleToDate} />
                {onDay && ctx.onUpdateTask && (
                  <div className="mt-2 border-t border-neutral-100 pt-2">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => { e.stopPropagation(); skipDay() }}
                      className="flex w-full items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50"
                    >
                      <CircleSlash className="w-4 h-4 shrink-0 text-neutral-400" />
                      {SKIP_LABEL['skip-day']}
                    </button>
                    <p className="px-2.5 text-[11px] text-neutral-400">{SKIP_NOTE['skip-day']}</p>
                  </div>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setWaiting(true) }}
                  className="mt-2 flex w-full items-center gap-2 px-2.5 py-2.5 rounded-lg text-sm font-medium text-neutral-700 bg-amber-50/60 hover:bg-amber-50 transition-colors"
                >
                  <Hourglass className="w-4 h-4 shrink-0 text-amber-500" />
                  <span className="flex flex-col items-start leading-tight">
                    <span>{item.isWaiting ? 'Edit what you’re waiting on' : 'Waiting on someone…'}</span>
                    <span className="text-[11px] font-normal text-neutral-400">Did your part — check back later</span>
                  </span>
                </button>
              </>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
