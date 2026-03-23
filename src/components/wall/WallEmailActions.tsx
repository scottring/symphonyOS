import type { EmailActionItem } from '@/types/emailAction'
import { CATEGORY_CONFIG } from '@/types/emailAction'

interface WallEmailActionsProps {
  items: EmailActionItem[]
  urgentItems: EmailActionItem[]
  onClick: () => void
}

export function WallEmailActions({ items, urgentItems, onClick }: WallEmailActionsProps) {
  if (items.length === 0) return null

  const topItem = urgentItems[0] || items[0]
  const cat = CATEGORY_CONFIG[topItem.category]
  const hasUrgent = urgentItems.length > 0

  return (
    <div
      className="flex items-center gap-4 cursor-pointer hover:bg-white/[0.12] transition-colors rounded-xl -m-1 p-1"
      onClick={onClick}
    >
      <div className="text-[2.2rem] flex-shrink-0">📬</div>
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="font-black uppercase tracking-widest text-[0.6rem]"
            style={{ color: hasUrgent ? '#EF4444' : '#60A5FA' }}
          >
            {hasUrgent ? `${urgentItems.length} Urgent` : 'Action Items'}
          </span>
          <span className="text-white/20 font-bold text-[0.55rem]">
            {items.length} total
          </span>
        </div>
        <span className="text-white font-bold text-[1rem] truncate leading-tight">
          {topItem.title}
        </span>
        {items.length > 1 && (
          <span className="text-white/30 text-[0.75rem]">
            +{items.length - 1} more
          </span>
        )}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        {[...new Set(items.map(i => i.category))].slice(0, 3).map(cat => (
          <span key={cat} className="text-[1rem]">{CATEGORY_CONFIG[cat].icon}</span>
        ))}
      </div>
    </div>
  )
}
