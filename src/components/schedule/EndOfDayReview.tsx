import { useMemo, useState } from 'react'
import { Sparkles, Check, ArrowRight, Moon, X } from 'lucide-react'
import type { Task } from '@/types/task'
import { useEveningReflection } from '@/hooks/useEveningReflection'

interface EndOfDayReviewProps {
  isOpen: boolean
  onClose: () => void
  tasks: Task[]
  /** The day being reviewed (usually today). */
  viewedDate: Date
  onUpdateTask: (id: string, updates: Partial<Task>) => void
}

function sameDay(a: Date | undefined, b: Date): boolean {
  if (!a) return false
  const d = new Date(a)
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate()
}

/**
 * The nightly end-of-day review: a light drawer over Today. Celebrate what got
 * done, capture the day's highlight (→ evening_reflections), sweep unfinished
 * items to tomorrow, and close the day. Deliberately quick — a 1–2 minute ritual,
 * not the immersive planning wizard.
 */
export function EndOfDayReview({ isOpen, onClose, tasks, viewedDate, onUpdateTask }: EndOfDayReviewProps) {
  const { highlight, setHighlight, notes, setNotes, save } = useEveningReflection(viewedDate)
  const [movedIds, setMovedIds] = useState<Set<string>>(() => new Set())

  const { completed, unfinished } = useMemo(() => {
    const onToday = tasks.filter((t) => sameDay(t.scheduledFor, viewedDate))
    return {
      completed: onToday.filter((t) => t.completed),
      unfinished: onToday.filter((t) => !t.completed),
    }
  }, [tasks, viewedDate])

  if (!isOpen) return null

  const pushToTomorrow = (t: Task) => {
    const base = t.scheduledFor ? new Date(t.scheduledFor) : new Date(viewedDate)
    const tomorrow = new Date(viewedDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(base.getHours(), base.getMinutes(), 0, 0)
    onUpdateTask(t.id, { bucket: 'timed', scheduledFor: tomorrow })
    setMovedIds((s) => new Set(s).add(t.id))
  }

  const close = async () => { await save(); onClose() }

  const remaining = unfinished.filter((t) => !movedIds.has(t.id))
  const dateLabel = viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="End of day review"
    >
      <div
        className="w-full md:max-w-lg max-h-[85vh] overflow-auto bg-bg-elevated rounded-t-3xl md:rounded-3xl shadow-2xl border border-neutral-200/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary-50 text-primary-600">
              <Moon className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-display text-xl text-neutral-800 leading-tight">End of day</h2>
              <p className="text-xs text-neutral-500">{dateLabel}</p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close"
            className="p-2 -mr-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-6">
          {/* Wins */}
          <section>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-primary-700">
              <Check className="w-4 h-4" strokeWidth={3} />
              {completed.length === 0
                ? 'Nothing marked done today — and that’s okay.'
                : `You closed ${completed.length} ${completed.length === 1 ? 'thing' : 'things'} today.`}
            </p>
            {completed.length > 0 && (
              <ul className="mt-2 space-y-1">
                {completed.slice(0, 4).map((t) => (
                  <li key={t.id} className="text-sm text-neutral-500 line-through leading-snug">{t.title}</li>
                ))}
                {completed.length > 4 && <li className="text-xs text-neutral-400">+{completed.length - 4} more</li>}
              </ul>
            )}
          </section>

          {/* Highlight */}
          <section className="space-y-2">
            <label className="block text-sm font-medium text-neutral-700">The best part of today?</label>
            <input
              type="text"
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              placeholder="A small win, a good moment, anything…"
              className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth remembering… (optional)"
              rows={2}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-800 placeholder:text-neutral-400 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
            />
          </section>

          {/* Loose ends */}
          {unfinished.length > 0 && (
            <section className="space-y-2">
              <p className="text-sm font-medium text-neutral-700">
                {remaining.length === 0
                  ? 'All loose ends swept to tomorrow.'
                  : `${remaining.length} loose ${remaining.length === 1 ? 'end' : 'ends'} — send to tomorrow, or leave them.`}
              </p>
              <ul className="space-y-1.5">
                {unfinished.map((t) => {
                  const moved = movedIds.has(t.id)
                  return (
                    <li key={t.id} className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2">
                      <span className={`flex-1 min-w-0 text-sm leading-snug ${moved ? 'text-neutral-400' : 'text-neutral-700'}`}>{t.title}</span>
                      {moved ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-primary-700">
                          <Check className="w-3 h-3" strokeWidth={3} /> tomorrow
                        </span>
                      ) : (
                        <button type="button" onClick={() => pushToTomorrow(t)}
                          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                          <ArrowRight className="w-3 h-3" /> Tomorrow
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Close */}
          <button type="button" onClick={close}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium hover:from-primary-600 hover:to-primary-700 transition-all shadow-sm">
            <Sparkles className="w-4 h-4" /> Close the day
          </button>
        </div>
      </div>
    </div>
  )
}
