import { useState, useCallback, useRef } from 'react'
import { MoreHorizontal, Redo2, Clock, Trash2, CalendarCog, Hourglass, FolderPlus, FolderOpen, MessageCircle } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { DiscussionPopover } from '@/components/triage'
import { WaitingForPopover } from './WaitingForPopover'
import { ConvertTaskModal } from './PromoteTaskToProjectButton'
import { PromoteToProjectModal } from './PromoteToProjectButton'

interface Props {
  item: TimelineItem
  /** Opens the full detail panel. */
  onOpenDetail: () => void
  /**
   * Tasks only — flag/unflag "needs discussion" and edit the note. The flag
   * itself shows in the row's title cluster (state); this is where it's set.
   */
  onUpdateDiscussion?: (next: { needsDiscussion: boolean; discussionNote?: string }) => void
}

export function ScheduleItemActionsMenu({ item, onOpenDetail, onUpdateDiscussion }: Props) {
  const ctx = useScheduleActionsContext()
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [waitingOpen, setWaitingOpen] = useState(false)
  const [discussionOpen, setDiscussionOpen] = useState(false)
  const [promoteOpen, setPromoteOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => { setOpen(false); setConfirmDelete(false) }, [])

  const taskId = item.originalTask?.id

  const saveWaitingFor = useCallback((waitingFor: string) => {
    if (!taskId) return
    ctx.onUpdateTask?.(taskId, {
      isWaiting: true,
      waitingFor,
      // Starting a NEW wait stamps the clock; editing the sentence on an
      // existing wait must not reset it, or the wait never ages and the
      // assistant never surfaces it.
      ...(item.isWaiting ? {} : { waitingSince: new Date() }),
    })
    setWaitingOpen(false)
  }, [ctx, taskId, item.isWaiting])

  const clearWaiting = useCallback(() => {
    if (!taskId) return
    ctx.onUpdateTask?.(taskId, {
      isWaiting: false,
      waitingFor: undefined,
      waitingSince: undefined,
    })
    setWaitingOpen(false)
  }, [ctx, taskId])

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
            className={`absolute right-0 z-50 min-w-[176px] py-1 bg-white rounded-xl border border-neutral-200 shadow-lg ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          >
            {/* Skip today — events only. Routines surface a dedicated inline
                skip icon on the row (SkipRoutineButton), so keeping it here too
                would be redundant. */}
            {isEvent && !item.completed && !item.skipped && (
              <button
                type="button"
                role="menuitem"
                onClick={run(() => ctx.onSkipEvent?.(eid))}
                className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <Redo2 className="w-4 h-4 text-neutral-400" />
                Skip today
              </button>
            )}

            {/* Waiting for… — tasks only. Opens a text field rather than
                toggling a bare flag: the value is WHAT you're waiting on, which
                is what shows on the row and what the assistant can act on once
                the wait goes long. */}
            {isTask && ctx.onUpdateTask && item.originalTask && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); setOpen(false); setWaitingOpen(true) }}
                className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <Hourglass className={`w-4 h-4 shrink-0 ${item.isWaiting ? 'text-amber-500' : 'text-neutral-400'}`} />
                {item.isWaiting ? 'Edit what you’re waiting for' : 'Waiting for…'}
              </button>
            )}

            {/* Tasks reschedule via the dedicated row button — so the menu only
                offers Edit details. Routines/events have no dedicated button;
                their reschedule (time/recurrence) lives in the detail panel. */}
            {isTask ? (
              <button
                type="button"
                role="menuitem"
                onClick={run(onOpenDetail)}
                className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <CalendarCog className="w-4 h-4 text-neutral-400" />
                Edit details
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={run(onOpenDetail)}
                className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <Clock className="w-4 h-4 text-neutral-400" />
                Reschedule
              </button>
            )}

            {/* Promote to project — moved off the row, where a hover-only icon
                cost a permanent rail column for a rarely-taken action. */}
            {(isTask || isEvent) && (
              item.projectId ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={run(() => ctx.onOpenProject?.(item.projectId!))}
                  className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <FolderOpen className="w-4 h-4 text-neutral-400" />
                  View project
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); setPromoteOpen(true) }}
                  className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <FolderPlus className="w-4 h-4 text-neutral-400" />
                  {isTask ? 'Convert to project' : 'Promote to project'}
                </button>
              )
            )}

            {/* Needs discussion — tasks only. The flag shows in the title
                cluster; this is where you set it. */}
            {isTask && onUpdateDiscussion && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); setOpen(false); setDiscussionOpen(true) }}
                className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <MessageCircle className={`w-4 h-4 ${item.needsDiscussion ? 'text-primary-500' : 'text-neutral-400'}`} />
                {item.needsDiscussion ? 'Edit discussion note' : 'Flag for discussion…'}
              </button>
            )}

            {/* Delete — task */}
            {isTask && ctx.onDeleteTask && item.originalTask && (
              <button
                type="button"
                role="menuitem"
                onClick={run(() => ctx.onDeleteTask?.(item.originalTask!.id))}
                className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
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
                className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
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
                  className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Confirm delete
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                  className="flex w-full text-left items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete routine
                </button>
              )
            )}
          </div>
        </>
      )}

      {waitingOpen && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => { e.stopPropagation(); setWaitingOpen(false) }}
          />
          <WaitingForPopover
            initialValue={item.waitingFor}
            taskId={taskId}
            onSave={saveWaitingFor}
            onClear={item.isWaiting ? clearWaiting : undefined}
            onCancel={() => setWaitingOpen(false)}
          />
        </>
      )}

      {discussionOpen && onUpdateDiscussion && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={(e) => { e.stopPropagation(); setDiscussionOpen(false) }}
          />
          <DiscussionPopover
            flagged={item.needsDiscussion ?? false}
            note={item.discussionNote ?? ''}
            onChange={({ flagged, note }) => onUpdateDiscussion({
              needsDiscussion: flagged,
              discussionNote: flagged ? note : undefined,
            })}
            onClose={() => setDiscussionOpen(false)}
          />
        </>
      )}

      {/* Promote modals live OUTSIDE the menu's own open-state: the menu closes
          the moment you pick the item, and a modal mounted inside it would
          unmount with it. */}
      {promoteOpen && isTask && (
        <ConvertTaskModal item={item} onClose={() => setPromoteOpen(false)} />
      )}
      {promoteOpen && isEvent && (
        <PromoteToProjectModal item={item} onClose={() => setPromoteOpen(false)} />
      )}
    </div>
  )
}
