import { useState, useCallback, useRef } from 'react'
import { MoreHorizontal, Redo2, Clock, Trash2, ChevronRight, CalendarCog } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { applyTriageWhen } from '@/lib/triage/applyWhen'
import type { TriageWhen } from './TriageWhenMenu'
import { RescheduleGrid } from './RescheduleGrid'

interface Props {
  item: TimelineItem
  /** Opens the full detail panel (where reschedule/time editing lives). */
  onOpenDetail: () => void
}

export function ScheduleItemActionsMenu({ item, onOpenDetail }: Props) {
  const ctx = useScheduleActionsContext()
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => { setOpen(false); setConfirmDelete(false); setRescheduling(false) }, [])

  // Apply a relative reschedule directly via the shared triage handlers (the
  // same mutation used across the app — so it actually persists).
  const reschedule = useCallback((when: TriageWhen) => {
    const taskId = item.originalTask?.id
    if (!taskId) return
    applyTriageWhen(when, taskId, {
      onPushTask: (id, target) => ctx.onPushTask?.(id, target),
      onSetBucket: (id, bucket) => ctx.onUpdateTask?.(id, { bucket, scheduledFor: undefined, isAllDay: undefined }),
    })
    close()
  }, [item.originalTask, ctx, close])

  const isTask = item.type === 'task'
  const isEvent = item.type === 'event'
  const isRoutine = item.type === 'routine'
  const rid = item.id.replace('routine-', '')
  const eid = item.id.replace('event-', '')

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  const run = (fn?: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    close()
    fn?.()
  }

  return (
    <div className="relative shrink-0" onClick={stop}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Item actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          if (!open) {
            const rect = triggerRef.current?.getBoundingClientRect()
            setOpenUp(rect ? window.innerHeight - rect.bottom < 280 : false)
          }
          setOpen((o) => !o)
        }}
        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => { e.stopPropagation(); close() }}
          />
          <div
            role="menu"
            className={`absolute right-0 z-50 bg-white rounded-xl border border-neutral-200 shadow-lg ${rescheduling ? 'w-64 p-2' : 'min-w-[176px] py-1'} ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          >
            {/* Reschedule submenu (tasks): the icon grid, applied immediately —
                no detail pane, no time-picker step. */}
            {rescheduling ? (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setRescheduling(false) }}
                  className="flex w-full items-center gap-1.5 px-1 pb-2 text-[11px] uppercase tracking-wider font-medium text-neutral-400 hover:text-neutral-600"
                >
                  <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Reschedule to
                </button>
                <RescheduleGrid onPick={reschedule} />
              </>
            ) : (
            <>
            {/* Skip today — routines and events */}
            {(isRoutine || isEvent) && !item.completed && !item.skipped && (
              <button
                type="button"
                role="menuitem"
                onClick={run(() => {
                  if (isRoutine) ctx.onSkipRoutine?.(rid)
                  else ctx.onSkipEvent?.(eid)
                })}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <Redo2 className="w-4 h-4 text-neutral-400" />
                Skip today
              </button>
            )}

            {/* Reschedule — tasks expand the one-tap WHEN submenu; routines/events
                open the detail panel (their reschedule is time/recurrence based). */}
            <button
              type="button"
              role="menuitem"
              onClick={isTask
                ? (e) => { e.stopPropagation(); setRescheduling(true) }
                : run(onOpenDetail)}
              className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              <span className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-neutral-400" />
                Reschedule
              </span>
              {isTask && <ChevronRight className="w-3.5 h-3.5 text-neutral-300" />}
            </button>

            {/* Edit details — opens the full panel (for tasks; routines/events use
                Reschedule above). */}
            {isTask && (
              <button
                type="button"
                role="menuitem"
                onClick={run(onOpenDetail)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <CalendarCog className="w-4 h-4 text-neutral-400" />
                Edit details
              </button>
            )}

            {/* Delete — task */}
            {isTask && ctx.onDeleteTask && item.originalTask && (
              <button
                type="button"
                role="menuitem"
                onClick={run(() => ctx.onDeleteTask?.(item.originalTask!.id))}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}

            {/* Delete — event */}
            {isEvent && ctx.onDeleteEvent && item.originalEvent && (
              <button
                type="button"
                role="menuitem"
                onClick={run(() => ctx.onDeleteEvent?.(item.originalEvent!))}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}

            {/* Delete routine — two-step confirm (kills it on every day) */}
            {isRoutine && ctx.onDeleteRoutine && (
              confirmDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={run(() => ctx.onDeleteRoutine?.(rid))}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Confirm delete
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete routine
                </button>
              )
            )}
            </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
