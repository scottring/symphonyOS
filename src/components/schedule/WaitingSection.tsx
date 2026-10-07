import { useState } from 'react'
import { ChevronRight, Hourglass } from 'lucide-react'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family'
import { TaskIconCheck } from '@/components/common/TaskIconCheck'
import { cardNotePreview } from '@/lib/cardNotePreview'
import { type WaitingRow, CHECK_BACK_CHOICES, CLEAR_WAITING, checkBackLabel, waitingUpdates } from '@/lib/today/waiting'

/**
 * The Inbox's "Waiting on" section — every open task you have done your part
 * on and are waiting to hear back about.
 *
 * A wait leaves Today until its check-back day (see lib/today/waiting.ts), so
 * without this list a wait with a missed or missing check-back day is
 * reachable from nowhere — the "I can't find the task anywhere" Scott hit on
 * 2026-10-01. Like Expired, it lives on the page you open on purpose, not as a
 * count on Today. Follow-ups that are due sort first and say so.
 *
 * Each wait is a card in the card language (design B, 2026-10-07): its icon
 * tile is its check, the amber line says who it waits on and when to check
 * back, then what the notes say. Open by default when something is due,
 * folded otherwise.
 */
export function WaitingSection({
  rows, onUpdateTask, onCompleteTask, onSelect, members = [],
}: {
  rows: WaitingRow[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void | Promise<void | boolean>
  onCompleteTask?: (id: string) => void
  onSelect?: (id: string) => void
  /** The household, for the avatars of whoever carries each wait. */
  members?: FamilyMember[]
}) {
  const dueCount = rows.filter((r) => r.due).length
  const [open, setOpen] = useState(dueCount > 0)
  const [rescheduling, setRescheduling] = useState<string | null>(null)

  if (rows.length === 0) return null

  return (
    <section aria-label="Waiting on" className="inbox-waiting">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inbox-section-toggle"
      >
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
        <span className="inbox-eyebrow">Waiting on · {rows.length}</span>
        <span className="inbox-section-hint">
          {dueCount > 0 ? `${dueCount} to follow up` : 'did your part, waiting to hear'}
        </span>
      </button>

      {open && (
        <ul className="inbox-cards">
          {rows.map(({ task, checkBack, due }) => {
            const preview = cardNotePreview(task.notes)
            const people = [...new Set([task.assignedTo, ...(task.assignedToAll ?? [])].filter(Boolean) as string[])]
              .flatMap((id) => members.find((m) => m.id === id) ?? [])
            const shared = task.scope === 'couple' || task.scope === 'compound'
            return (
              <li key={task.id} className="sym-card inbox-card">
                <div className="inbox-card-lead">
                  <TaskIconCheck
                    task={{ title: task.title, category: task.category, phoneNumber: task.phoneNumber, location: task.location, links: task.links, context: task.context }}
                    done={task.completed}
                    onToggle={onCompleteTask ? () => onCompleteTask(task.id) : undefined}
                  />
                </div>
                <div className="inbox-card-body">
                  <button type="button" onClick={() => onSelect?.(task.id)} className="inbox-card-open">
                    <span className="sym-card-title">{task.title}</span>
                  </button>
                  <p className="inbox-card-wait">
                    <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {task.waitingFor ? `Waiting on ${task.waitingFor}` : 'Waiting'}
                      {' · '}
                      <span className={due ? 'is-due' : undefined}>
                        {checkBack
                          ? (due ? `follow up — was ${checkBackLabel(checkBack)}` : `check back ${checkBackLabel(checkBack)}`)
                          : 'no check-back day'}
                      </span>
                    </span>
                  </p>
                  {preview && <p className="sym-card-note">{preview}</p>}
                  <div className="inbox-card-actions">
                    <button
                      type="button"
                      onClick={() => setRescheduling((id) => (id === task.id ? null : task.id))}
                      aria-expanded={rescheduling === task.id}
                      className="sym-btn sym-btn-sm"
                    >
                      Check back…
                    </button>
                    <button
                      type="button"
                      onClick={() => void onUpdateTask(task.id, CLEAR_WAITING)}
                      className="sym-btn sym-btn-sm"
                      title="It's back in your hands"
                    >
                      Not waiting
                    </button>
                  </div>
                  {rescheduling === task.id && (
                    <div className="inbox-card-actions" role="group" aria-label="Check back">
                      {CHECK_BACK_CHOICES.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => {
                            setRescheduling(null)
                            void onUpdateTask(task.id, waitingUpdates(task, task.waitingFor ?? '', c.date()))
                          }}
                          className="sym-btn sym-btn-sm"
                        >
                          {c.label} <span className="inbox-btn-sub">{checkBackLabel(c.date())}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="inbox-card-trail">
                  {shared && <span className="sym-tag">Shared</span>}
                  {people.length > 0 && (
                    <span className="inbox-card-who">
                      {people.slice(0, 3).map((m) => <AssigneeAvatar key={m.id} member={m} size="sm" className="inbox-avatar" />)}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
