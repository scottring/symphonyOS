// src/components/schedule/RoutineMoveButton.tsx
//
// The routine row's one verb: move THIS occurrence somewhere else, or skip it.
// A routine used to offer only "Skip today" here, so a quarterly chore that
// came due on a busy Thursday could be dropped but never put on Saturday
// (Scott, 2026-10-01). Every target writes a one-day override on the
// occurrence — the routine's rule is never touched — through the same
// schedule-actions context the task RescheduleButton uses.

import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, CircleSlash } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'
import type { TriageWhen } from './TriageWhenMenu'
import { RescheduleGrid, dateForWhen } from './RescheduleGrid'

/** The days a single occurrence can move to. Pool targets (this month,
 *  someday) mean no day, and an occurrence has to be on one. */
export const ROUTINE_MOVE_WHENS: readonly TriageWhen[] = ['tomorrow', 'this-weekend', 'next-weekend', 'next-week']

export function RoutineMoveButton({ item }: { item: TimelineItem }) {
  const ctx = useScheduleActionsContext()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  usePopoverFocus(open, triggerRef, panelRef, close)

  const routineId = item.id.replace('routine-', '')
  const canMove = !!ctx.onMoveRoutineToDay

  // Same portal + measured placement as RescheduleButton: the rail lives inside
  // scrolling ancestors that would clip an absolutely-positioned panel.
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

  const moveTo = useCallback((when: TriageWhen, day?: Date) => {
    const target = day ?? dateForWhen(when)
    setOpen(false)
    if (target) void ctx.onMoveRoutineToDay?.(routineId, target)
  }, [ctx, routineId])

  // "Pick date & time…": All day is a day move (keeps the routine's own time,
  // or none); a chosen hour pins it there for that one day.
  const moveToDate = useCallback((date: Date, isAllDay: boolean) => {
    setOpen(false)
    if (isAllDay) void ctx.onMoveRoutineToDay?.(routineId, date)
    else ctx.onPushRoutine?.(routineId, date)
  }, [ctx, routineId])

  const skip = useCallback(() => {
    setOpen(false)
    ctx.onSkipRoutine?.(routineId)
  }, [ctx, routineId])

  if (!canMove && !ctx.onSkipRoutine) return null

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Move or skip"
        title="Move or skip"
        aria-haspopup="dialog"
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
            role="dialog"
            aria-label="Move this time to"
            style={{ top: 0, left: 0, visibility: 'hidden' }}
            className="fixed z-[100] w-80 p-2 bg-white rounded-xl border border-neutral-200 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {canMove && (
              <>
                <div className="px-1 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">Move this time to</div>
                <RescheduleGrid
                  whens={ROUTINE_MOVE_WHENS}
                  weekendDays
                  onPick={moveTo}
                  onPickDate={moveToDate}
                />
              </>
            )}
            {ctx.onSkipRoutine && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); skip() }}
                className={`${canMove ? 'mt-2 border-t border-neutral-100 pt-2.5' : ''} flex w-full items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50`}
              >
                <CircleSlash className="w-4 h-4 shrink-0 text-neutral-400" />
                Skip this time
              </button>
            )}
            <p className="px-2.5 pt-1.5 text-[11px] text-neutral-400">Only this time — the routine keeps its schedule.</p>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
