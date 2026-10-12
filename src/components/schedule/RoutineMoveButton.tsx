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
import { RescheduleGrid } from './RescheduleGrid'
import { WHEN_ORDER, SKIP_LABEL, SKIP_NOTE, moreLabel } from '@/lib/triage/contract'
import { dayForWhen } from '@/lib/triage/applyWhen'
import { showToast } from '@/hooks/useToast'

/** The Whens an occurrence is offered: the whole contract, in its order. A
 *  period asks for a day in it; Someday and This season explain why one time
 *  of a routine cannot go there (lib/triage/contract.ts). */
export const ROUTINE_MOVE_WHENS: readonly TriageWhen[] = WHEN_ORDER

export function RoutineMoveButton({ item, onOpen }: { item: TimelineItem; onOpen?: () => void }) {
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

  // Every target writes a one-day override on THIS occurrence; siblings and
  // the routine's rule are untouched. Success (and its Undo) is announced by
  // the writer once stored; a move that did not land says so, with Retry.
  const failed = useCallback((retry: () => void) => {
    showToast('Didn’t move it. Nothing changed.', 'error', 8000, { label: 'Retry', onClick: retry })
  }, [])
  const moveToDay = useCallback(function attempt(day: Date) {
    setOpen(false)
    void (async () => {
      const ok = await ctx.onMoveRoutineToDay?.(routineId, day)
      if (ok === false) failed(() => attempt(day))
    })()
  }, [ctx, routineId, failed])
  // Pinned to a time on one day (Tonight, a picked hour).
  const pinAt = useCallback(function attempt(at: Date) {
    setOpen(false)
    void (async () => {
      const ok = await ctx.onPushRoutine?.(routineId, at)
      if (ok === false) failed(() => attempt(at))
    })()
  }, [ctx, routineId, failed])
  const moveTo = useCallback((when: TriageWhen, day?: Date) => {
    if (when === 'tonight' && !day) {
      const at = dayForWhen('tonight')
      if (at) pinAt(at)
      return
    }
    const target = day ?? dayForWhen(when)
    if (target) moveToDay(target)
  }, [pinAt, moveToDay])

  // "Pick date & time…": All day is a day move (keeps the routine's own time,
  // or none); a chosen hour pins it there for that one day.
  const moveToDate = useCallback((date: Date, isAllDay: boolean) => {
    if (isAllDay) moveToDay(date)
    else pinAt(date)
  }, [pinAt, moveToDay])

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
            className="fixed z-[100] w-80 max-w-[calc(100vw-16px)] max-h-[85dvh] overflow-y-auto p-2 bg-white rounded-xl border border-neutral-200 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {canMove && (
              <>
                <div className="px-1 pb-2 text-[11px] uppercase tracking-wider text-neutral-400">Move this time to</div>
                <RescheduleGrid
                  entity="occurrence"
                  whens={ROUTINE_MOVE_WHENS}
                  weekendDays
                  currentDay={ctx.viewedDate ?? new Date()}
                  onPick={moveTo}
                  onPickDate={moveToDate}
                  // Skip this time sits right below; the routine itself opens here.
                  alternatives={onOpen ? [{ label: moreLabel('open', { entity: 'occurrence' }), onSelect: () => { setOpen(false); onOpen() } }] : []}
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
                {SKIP_LABEL['skip-occurrence']}
              </button>
            )}
            <p className="px-2.5 pt-1.5 text-[11px] text-neutral-400">{SKIP_NOTE['skip-occurrence']}</p>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
