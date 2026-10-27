// src/components/schedule/SnoozeButton.tsx
//
// The task row's one verb: snooze it to a later day. Today, trimmed
// (2026-10-14) took the row's Reschedule button and ⋯ menu away, which left
// "not today" a trip through the item panel; Scott wanted that one move back
// on the row (2026-10-27). Just the deferral — waiting, Need today and delete
// stay in the panel. The routine row's RoutineMoveButton is its twin.

import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlarmClock } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'
import { wasWritten } from '@/hooks/useGatedTaskActions'
import { focusSnapshot } from '@/lib/placement/model'
import { formatDateLabel } from '@/lib/dateHelpers'
import { showToast } from '@/hooks/useToast'
import type { TriageWhen } from './TriageWhenMenu'
import { RescheduleGrid, dateForWhen } from './RescheduleGrid'

/** Later days only — a snooze never lands on today. */
const SNOOZE_WHENS: readonly TriageWhen[] = ['tomorrow', 'this-weekend', 'next-week']

function snoozeLabel(date: Date, isAllDay: boolean): string {
  return isAllDay
    ? formatDateLabel(date)
    : `${formatDateLabel(date)}, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export function SnoozeButton({ item }: { item: TimelineItem }) {
  const ctx = useScheduleActionsContext()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  usePopoverFocus(open, triggerRef, panelRef, close)

  // Same portal + measured placement as RoutineMoveButton: the rail lives
  // inside scrolling ancestors that would clip an absolutely-positioned panel.
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

  // pushTask does the work: dates the task, releases today's choice and
  // counts the deferral. Undo restores exactly what it changed, and is only
  // offered when the write happened (a cancelled domain gate writes nothing).
  const snoozeTo = useCallback((target: Date, isAllDay: boolean) => {
    setOpen(false)
    const task = item.originalTask
    if (!task || !ctx.onPushTask) return
    const previous = {
      bucket: task.bucket,
      scheduledFor: task.scheduledFor,
      isAllDay: task.isAllDay,
      focus: focusSnapshot(task),
      deferCount: task.deferCount,
    }
    void (async () => {
      if (!(await wasWritten(ctx.onPushTask?.(task.id, target)))) return
      const message = `Snoozed to ${snoozeLabel(target, isAllDay)}`
      if (ctx.onRegisterUndo) ctx.onRegisterUndo(message, () => { void ctx.onUpdateTask?.(task.id, previous) })
      else showToast(message, 'success')
    })()
  }, [item.originalTask, ctx])

  const pick = useCallback((when: TriageWhen) => {
    const day = dateForWhen(when)
    if (day) snoozeTo(day, true)
  }, [snoozeTo])

  if (!ctx.onPushTask || !item.originalTask) return null

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Snooze"
        title="Snooze"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
      >
        <AlarmClock className="w-4 h-4" />
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
            aria-label="Snooze until"
            style={{ top: 0, left: 0, visibility: 'hidden' }}
            className="fixed z-[100] w-80 p-2 bg-white rounded-xl border border-neutral-200 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-1 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">Snooze until</div>
            <RescheduleGrid whens={SNOOZE_WHENS} onPick={pick} onPickDate={snoozeTo} />
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
