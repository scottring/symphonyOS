import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { TodayItem } from './today/todayItem'

interface WallDiscussListProps {
  items: TodayItem[]
  onResolve: (id: string) => void
}

export function WallDiscussList({ items, onResolve }: WallDiscussListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (items.length === 0) return null

  return (
    <div className="mt-4">
      <div className="text-[10px] uppercase tracking-widest text-amber-300/60 mb-2 px-1">
        To discuss ({items.length})
      </div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id} className="rounded-lg bg-amber-900/15 px-3 py-2.5 min-h-[56px]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Resolve discussion"
                onClick={() => onResolve(it.id)}
                className="w-10 h-10 rounded-full bg-amber-900/30 hover:bg-amber-700/40 flex items-center justify-center shrink-0 transition-colors"
              >
                <MessageCircle className="w-5 h-5 text-amber-300" />
              </button>
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === it.id ? null : it.id)}
                className="flex-1 text-left text-base text-white hover:text-amber-200 transition-colors truncate"
              >
                {it.title}
              </button>
            </div>
            {expandedId === it.id && it.discussionNote && (
              <div className="mt-2 text-sm text-white/70 border-l-2 border-amber-700/30 pl-3 ml-13">
                {it.discussionNote}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
