// src/components/schedule/EmailReviewSheet.tsx
//
// "New from email" — the review that happens AFTER the commit.
//
// Forwarded school mail is auto-placed: a dated, confident event is on its day
// before anyone opens the app. That is the promise, and it is also the risk —
// a wrong guess is on the calendar unannounced. This sheet is the answer, and
// its shape follows from what it is for:
//
//   - It is a LOOK, not a queue. Every row here is already placed. Keep is the
//     default and therefore has no button: doing nothing is the common case and
//     must cost nothing. Only the two corrections are controls.
//   - It groups by CAPTURE, not by day. The question a reader has is "what did
//     that email do?", and the answer only makes sense next to the email it
//     came from.
//   - It has no counts and no badges. Today never keeps score (see
//     TodayBacklogFooter); the door being there at all is the whole signal.
//
// The date control is the row action rail's own RescheduleButton rather than a
// second picker built for this sheet: fixing a date here has to mean exactly
// what fixing a date on a Today row means, domain gate and toast included.

import { useMemo } from 'react'
import { X, Mail, Trash2 } from 'lucide-react'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import type { UnreviewedCapture } from '@/hooks/useUnreviewedCaptures'
import { taskToTimelineItem } from '@/types/timeline'
import { formatDateLabel } from '@/lib/dateHelpers'
import { useMobile } from '@/hooks/useMobile'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { PanelShell } from '@/components/surface/PanelShell'
import { RescheduleButton } from './RescheduleButton'

export interface EmailReviewSheetProps {
  open: boolean
  captures: UnreviewedCapture[]
  /** The client task list — rows are matched to captures by `captureId`. */
  tasks: Task[]
  members: FamilyMember[]
  /** Stamps `reviewed_at` for everything shown; the host owns that write. */
  onClose: () => void
  /**
   * A row the reader says does not belong. The host deletes it and owns the
   * undo toast, exactly as it owns the To-buy conversion's — the toast has to
   * outlive this sheet, so it cannot live in it.
   */
  onDismiss: (taskId: string) => void
  /** Rows the host is holding for undo: shown as gone, not yet deleted. */
  dismissedIds?: string[]
}

/** "Hillside Elementary · Field trip Friday", or whichever half exists. */
function captureLabel(capture: UnreviewedCapture): string {
  const parts = [capture.sourceLabel, capture.subject].filter(Boolean) as string[]
  return parts.length > 0 ? parts.join(' · ') : 'From an email'
}

/** Where the extractor put this row, in the reader's words. */
function placement(task: Task): string {
  if (!task.scheduledFor) return 'Inbox'
  const label = formatDateLabel(task.scheduledFor)
  if (task.isAllDay) return label
  return `${label}, ${task.scheduledFor.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

function MemberPill({ id, members }: { id: string | null | undefined; members: FamilyMember[] }) {
  if (!id) return null
  const member = members.find((m) => m.id === id)
  if (!member) return null
  return <AssigneeAvatar member={member} size="sm" />
}

export function EmailReviewSheet({
  open, captures, tasks, members, onClose, onDismiss, dismissedIds = [],
}: EmailReviewSheetProps) {
  const isMobile = useMobile()

  // One pass over the task list per render: capture id → its top-level rows.
  // Subtasks are NOT top-level rows here even though `useSupabaseTasks` also
  // stamps them with the capture id — a per-person item belongs under the
  // event it came from, never beside it.
  const byCapture = useMemo(() => {
    const hidden = new Set(dismissedIds)
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!task.captureId || task.parentTaskId || hidden.has(task.id)) continue
      const list = map.get(task.captureId)
      if (list) list.push(task)
      else map.set(task.captureId, [task])
    }
    return map
  }, [tasks, dismissedIds])

  if (!open) return null

  const sections = captures.map((capture) => ({
    capture,
    rows: byCapture.get(capture.id) ?? [],
  }))

  return (
    <div
      // Bottom sheet on a phone, right-hand panel on a desktop — the same
      // split every detail surface in the app makes.
      className={`fixed inset-0 z-50 flex bg-black/30 backdrop-blur-sm ${
        isMobile ? 'items-end justify-center' : 'items-center justify-end'
      }`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New from email"
    >
      <div
        className={`w-full max-h-[85vh] overflow-auto ${isMobile ? '' : 'md:max-w-md md:mr-4'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <PanelShell
          identity={
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-primary-50 text-primary-600">
                  <Mail className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-lg text-neutral-800 leading-tight">New from email</h2>
                  <p className="text-xs text-neutral-500">Already on the calendar — fix or drop anything wrong.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 p-2 -mr-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          }
          details={
            <>
              {sections.map(({ capture, rows }) => (
                <section key={capture.id} role="group" aria-label={captureLabel(capture)}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
                    {captureLabel(capture)}
                  </p>
                  {rows.length === 0 ? (
                    <p className="text-[13px] text-neutral-400">Nothing was placed from this one.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {rows.map((task) => (
                        <li
                          key={task.id}
                          data-testid={`email-review-row-${task.id}`}
                          className="rounded-xl border border-neutral-100 bg-white px-3 py-2"
                        >
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-neutral-800 leading-snug">{task.title}</p>
                              <p className="text-xs text-neutral-400">{placement(task)}</p>
                            </div>
                            <MemberPill id={task.assignedTo} members={members} />
                            <RescheduleButton item={taskToTimelineItem(task)} />
                            <button
                              type="button"
                              onClick={() => onDismiss(task.id)}
                              aria-label={`Dismiss ${task.title}`}
                              title="Dismiss"
                              className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Per-person items ride WITH the row they belong to.
                              Dismissing the parent takes them (the DB cascades
                              on parent_task_id), which is why they are not
                              separately dismissible here. */}
                          {(task.subtasks ?? []).length > 0 && (
                            <ul className="mt-1.5 pl-3 border-l border-neutral-100 space-y-1">
                              {(task.subtasks ?? []).map((sub) => (
                                <li key={sub.id} className="flex items-center gap-2">
                                  <MemberPill id={sub.assignedTo} members={members} />
                                  <span className="text-[13px] text-neutral-600 leading-snug">{sub.title}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </>
          }
        />
      </div>
    </div>
  )
}
