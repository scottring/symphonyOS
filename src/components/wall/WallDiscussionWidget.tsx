import { MessageCircle } from 'lucide-react'
import type { DiscussionItem } from '@/hooks/useFamilyDiscussionItems'

interface WallDiscussionWidgetProps {
  items: DiscussionItem[]
  onClick: () => void
}

export function WallDiscussionWidget({ items, onClick }: WallDiscussionWidgetProps) {
  if (items.length === 0) return null

  const visible = items.slice(0, 2)
  const remaining = items.length - visible.length

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 cursor-pointer hover:bg-white/[0.12] transition-colors rounded-xl -m-1 p-1 w-full text-left"
      aria-label={`${items.length} to discuss`}
    >
      <MessageCircle className="w-9 h-9 flex-shrink-0 text-amber-300" />
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-black uppercase tracking-widest text-[0.6rem] text-amber-300">
            {items.length} to discuss
          </span>
        </div>
        <span className="text-white font-bold text-[1rem] truncate leading-tight">
          {visible[0].title}
        </span>
        {visible[1] && (
          <span className="text-white/60 text-[0.85rem] truncate leading-tight">
            {visible[1].title}
          </span>
        )}
        {remaining > 0 && (
          <span className="text-white/30 text-[0.75rem]">+{remaining} more</span>
        )}
      </div>
    </button>
  )
}
