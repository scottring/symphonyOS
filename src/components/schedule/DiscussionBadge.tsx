import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import type { DiscussionItem } from '@/lib/discussionItems'

interface DiscussionBadgeProps {
  items: DiscussionItem[]
  /** Open a flagged task's detail view. Receives the item id namespaced as `task-<id>`. */
  onSelectItem: (id: string) => void
}

/**
 * Glanceable "N to discuss" badge for the Today stats row. Replaces the
 * old right-rail ForDiscussion panel. Renders nothing when there is nothing
 * to discuss (caller also gates, but guard here too).
 */
export function DiscussionBadge({ items, onSelectItem }: DiscussionBadgeProps) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
        aria-label={`${items.length} to discuss`}
      >
        <MessageSquare className="w-4 h-4 text-amber-500" />
        {items.length} to discuss
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 w-72 bg-white rounded-xl border border-neutral-200 shadow-lg p-2"
          onMouseLeave={() => setOpen(false)}
        >
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => { onSelectItem(`task-${item.id}`); setOpen(false) }}
                  className="w-full flex items-start gap-2 text-left rounded-md px-2 py-1.5 hover:bg-neutral-50"
                >
                  <MessageSquare className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-neutral-800 leading-tight truncate">{item.title}</p>
                    {item.note && (
                      <p className="text-[12px] text-neutral-500 leading-snug line-clamp-2 mt-0.5">{item.note}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  )
}
