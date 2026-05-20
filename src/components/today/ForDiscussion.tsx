import type { DiscussionItem } from '@/lib/discussionItems'
import { MessageSquare } from 'lucide-react'

interface ForDiscussionProps {
  items: DiscussionItem[]
  /** Open a flagged task's detail view. */
  onSelectItem: (id: string) => void
}

/**
 * Right-rail "For discussion" panel. Surfaces tasks that have been flagged
 * `needs discussion` so the next time Scott and Iris (or any pair) are
 * together, the queue is right there in the rail.
 *
 * One row per flagged task: title + optional one-line note. Click opens the
 * task's detail view. Always renders, even when empty — the panel is a
 * standing reminder that this is how things get tabled deliberately.
 */
export function ForDiscussion({ items, onSelectItem }: ForDiscussionProps) {
  const isEmpty = items.length === 0

  return (
    <section
      aria-labelledby="rail-for-discussion"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-for-discussion"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        For discussion
      </h2>

      {isEmpty ? (
        <p className="flex items-center gap-2 text-[13px] text-neutral-500">
          <MessageSquare className="w-4 h-4 text-neutral-300 shrink-0" aria-hidden />
          <span>Nothing to discuss right now.</span>
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelectItem(item.id)}
                className="w-full flex items-start gap-2 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 rounded-md px-1 -mx-1 py-1"
                aria-label={item.title}
              >
                <MessageSquare className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-neutral-800 leading-tight truncate group-hover:text-neutral-900">
                    {item.title}
                  </p>
                  {item.note && (
                    <p className="text-[12px] text-neutral-500 leading-snug line-clamp-2 mt-0.5">
                      {item.note}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
