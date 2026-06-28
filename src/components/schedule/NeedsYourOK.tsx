/**
 * NeedsYourOK — surfaces COS-proposed actions (the action_queue) right inside
 * Today, where you actually live. This is the human face of the action layer:
 * the assistant proposes (draft an email, add a task from an email, book a
 * slot), you Approve or Dismiss with one tap. Nothing executes until you say so.
 *
 * Practical, not decorative: it turns "today's responsibilities" into things
 * you can clear in a tap instead of chores you have to remember.
 */
import { useState } from 'react'
import { Check, X, Mail, CalendarPlus, ListPlus, UserPen, FileText, MessageSquare, Sparkles } from 'lucide-react'
import { useActionQueue, type ActionQueueItem } from '@/hooks/useActionQueue'
import { logger } from '@/lib/logger'

const ACTION_ICON: Record<ActionQueueItem['action_type'], typeof Mail> = {
  send_email: Mail,
  draft_email: Mail,
  create_task: ListPlus,
  schedule_meeting: CalendarPlus,
  update_contact: UserPen,
  write_vault_note: FileText,
  send_text: MessageSquare,
}

/** What approving will actually do — set plainly so the user is never surprised. */
function approveVerb(item: ActionQueueItem): string {
  switch (item.action_type) {
    case 'send_email':
      return item.payload?.confirmed_send === true ? 'Send email' : 'Save draft'
    case 'draft_email':
      return 'Save draft'
    case 'create_task':
      return 'Add task'
    case 'schedule_meeting':
      return 'Add to calendar'
    case 'update_contact':
      return 'Update contact'
    case 'write_vault_note':
      return 'Save note'
    case 'send_text':
      return 'Send text'
    default:
      return 'Approve'
  }
}

export function NeedsYourOK() {
  const { actions, approveAction, rejectAction, refetch } = useActionQueue()
  const [busyId, setBusyId] = useState<string | null>(null)
  // Locally hide rows we've resolved, so the strip updates instantly instead of
  // waiting on a realtime UPDATE (which the table may not even publish).
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())

  const visible = actions.filter((a) => !resolvedIds.has(a.id))
  if (visible.length === 0) return null

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id)
    setResolvedIds((prev) => new Set(prev).add(id)) // optimistic remove
    try {
      await fn()
      refetch() // reconcile with server truth
    } catch (err) {
      logger.error('Action resolve failed:', err)
      // roll back the optimistic removal so the row comes back
      setResolvedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-primary-200/60 bg-primary-50/40 px-4 py-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary-600" />
        <h3 className="text-[11px] uppercase tracking-wider font-semibold text-primary-700/80">
          Needs your OK
        </h3>
        <span className="text-[11px] text-primary-600/70 tabular-nums">{visible.length}</span>
      </div>

      <ul className="space-y-1.5">
        {visible.map((item) => {
          const Icon = ACTION_ICON[item.action_type] ?? Sparkles
          const busy = busyId === item.id
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2.5 border border-neutral-200/60"
            >
              <Icon className="w-4 h-4 text-neutral-500 shrink-0" />
              <p className="min-w-0 flex-1 text-[14px] text-neutral-800 truncate">{item.summary}</p>

              <button
                type="button"
                disabled={busy}
                onClick={() => run(item.id, () => approveAction(item.id))}
                title={approveVerb(item)}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1.5 text-[13px] font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{approveVerb(item)}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(item.id, () => rejectAction(item.id))}
                title="Dismiss"
                aria-label="Dismiss"
                className="shrink-0 inline-flex items-center justify-center rounded-lg p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
