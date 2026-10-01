import { useState } from 'react'
import { ChevronRight, Hourglass, Check } from 'lucide-react'
import type { Task } from '@/types/task'
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
 * Open by default when something is due, folded otherwise.
 */
export function WaitingSection({
  rows, onUpdateTask, onCompleteTask, onSelect,
}: {
  rows: WaitingRow[]
  onUpdateTask: (id: string, updates: Partial<Task>) => void | Promise<void | boolean>
  onCompleteTask?: (id: string) => void
  onSelect?: (id: string) => void
}) {
  const dueCount = rows.filter((r) => r.due).length
  const [open, setOpen] = useState(dueCount > 0)
  const [rescheduling, setRescheduling] = useState<string | null>(null)

  if (rows.length === 0) return null

  return (
    <section aria-label="Waiting on" className="card p-4 mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left"
      >
        <ChevronRight className={`w-4 h-4 shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="shrink-0 whitespace-nowrap text-sm font-medium text-neutral-700">Waiting on · {rows.length}</span>
        <span className="min-w-0 truncate text-xs text-neutral-400">
          {dueCount > 0 ? `${dueCount} to follow up` : 'did your part, waiting to hear'}
        </span>
      </button>

      {open && (
        <ul className="mt-3 space-y-1.5">
          {rows.map(({ task, checkBack, due }) => (
            <li key={task.id} className="rounded-lg px-2.5 py-2 hover:bg-neutral-50">
              {/* Phones stack the actions under the text; three buttons
                  beside a title leave it no room at 390px. */}
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2.5">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <Hourglass className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" aria-hidden />
                <button
                  type="button"
                  onClick={() => onSelect?.(task.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="block text-sm text-neutral-800 truncate">{task.title}</span>
                  <span className="block text-xs text-neutral-500 sm:truncate">
                    {task.waitingFor ? `On ${task.waitingFor}` : 'Waiting'}
                    {' · '}
                    <span className={due ? 'text-amber-700 font-medium' : undefined}>
                      {checkBack
                        ? (due ? `follow up — was ${checkBackLabel(checkBack)}` : `check back ${checkBackLabel(checkBack)}`)
                        : 'no check-back day'}
                    </span>
                  </span>
                </button>
                </div>
                <div className="ml-6 flex shrink-0 items-center gap-1 sm:ml-0">
                  <button
                    type="button"
                    onClick={() => setRescheduling((id) => (id === task.id ? null : task.id))}
                    aria-expanded={rescheduling === task.id}
                    className="text-xs px-2 py-1 rounded-md text-neutral-500 hover:text-primary-700 hover:bg-primary-50"
                  >
                    Check back…
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateTask(task.id, CLEAR_WAITING)}
                    className="text-xs px-2 py-1 rounded-md text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                    title="It's back in your hands"
                  >
                    Not waiting
                  </button>
                  {onCompleteTask && (
                    <button
                      type="button"
                      onClick={() => onCompleteTask(task.id)}
                      aria-label={`Done: ${task.title}`}
                      title="Done"
                      className="p-1 rounded-md text-neutral-400 hover:text-primary-700 hover:bg-primary-50"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {rescheduling === task.id && (
                <div className="mt-2 ml-6 flex flex-wrap gap-1.5" role="group" aria-label="Check back">
                  {CHECK_BACK_CHOICES.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => {
                        setRescheduling(null)
                        void onUpdateTask(task.id, waitingUpdates(task, task.waitingFor ?? '', c.date()))
                      }}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-neutral-50 text-neutral-700 hover:bg-primary-50 hover:text-primary-700"
                    >
                      {c.label} <span className="text-neutral-400">{checkBackLabel(c.date())}</span>
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
