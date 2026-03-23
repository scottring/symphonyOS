import type { EmailActionItem, EmailActionCategory } from '@/types/emailAction'
import { CATEGORY_CONFIG } from '@/types/emailAction'

interface EmailActionStripProps {
  items: EmailActionItem[]
  categories?: EmailActionCategory[]
  title?: string
  maxItems?: number
}

/**
 * Compact strip of email action items for embedding in contextual views.
 * Filters by category when specified.
 */
export function EmailActionStrip({
  items,
  categories,
  title = 'From Email',
  maxItems = 4,
}: EmailActionStripProps) {
  const filtered = categories
    ? items.filter(i => categories.includes(i.category))
    : items

  if (filtered.length === 0) return null

  const shown = filtered.slice(0, maxItems)

  return (
    <div className="mt-6">
      <h3 className="text-white/30 font-black uppercase tracking-widest text-[0.7rem] mb-3 flex items-center gap-2">
        <span>📬</span>
        {title}
        <span className="text-white/15">{filtered.length}</span>
      </h3>
      <div className="space-y-2">
        {shown.map(item => {
          const cat = CATEGORY_CONFIG[item.category]
          const isOverdue = item.due_date && new Date(item.due_date + 'T00:00:00') < new Date(new Date().toDateString())

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08]"
            >
              <span className="text-[1.5rem] flex-shrink-0">{cat.icon}</span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-white font-bold text-[1rem] truncate leading-tight">
                  {item.title}
                </span>
                {item.description && (
                  <span className="text-white/30 text-[0.8rem] truncate">
                    {item.description}
                  </span>
                )}
              </div>
              {item.due_date && (
                <span className={`text-[0.7rem] font-black uppercase tracking-widest flex-shrink-0
                  ${isOverdue ? 'text-red-400' : 'text-white/40'}`}
                >
                  {formatCompactDate(item.due_date)}
                </span>
              )}
              {item.urgency === 'urgent' && (
                <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0 animate-pulse" />
              )}
            </div>
          )
        })}
        {filtered.length > maxItems && (
          <p className="text-white/20 text-[0.7rem] font-bold uppercase tracking-widest text-center pt-1">
            +{filtered.length - maxItems} more
          </p>
        )}
      </div>
    </div>
  )
}

function formatCompactDate(dateStr: string): string {
  const due = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)}d late`
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tmrw'
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
