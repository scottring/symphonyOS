import { useState } from 'react'
import type { EmailActionItem } from '@/types/emailAction'
import { CATEGORY_CONFIG } from '@/types/emailAction'
import { ConceptIcon } from '@/lib/conceptIcons'

interface EmailActionsBannerProps {
  items: EmailActionItem[]
  onAcknowledge: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string) => void
}

/**
 * Compact email action items banner for the Today schedule view.
 * Shows urgent/due items that need attention.
 */
export function EmailActionsBanner({
  items,
  onAcknowledge,
  onDismiss,
  onSnooze,
}: EmailActionsBannerProps) {
  const [expanded, setExpanded] = useState(false)

  // Only show active (new) items
  const activeItems = items.filter(i => i.status === 'new')
  if (activeItems.length === 0) return null

  // Sort: urgent first, then by due date
  const sorted = [...activeItems].sort((a, b) => {
    if (a.urgency === 'urgent' && b.urgency !== 'urgent') return -1
    if (b.urgency === 'urgent' && a.urgency !== 'urgent') return 1
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    return 1
  })

  const urgentCount = sorted.filter(i => i.urgency === 'urgent').length
  const shown = expanded ? sorted : sorted.slice(0, 3)

  return (
    <div className="mb-8 animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="time-group-header mb-3 flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <ConceptIcon name="email" decorative />
        From Email
        <span className="text-neutral-400 font-normal">{activeItems.length}</span>
        {urgentCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">
            {urgentCount} urgent
          </span>
        )}
      </button>

      <div className="space-y-2">
        {shown.map(item => {
          const cat = CATEGORY_CONFIG[item.category]
          const isOverdue = item.due_date && new Date(item.due_date + 'T00:00:00') < new Date(new Date().toDateString())

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50/60 border border-amber-200/60 group"
            >
              <span className="text-lg flex-shrink-0 flex items-center"><ConceptIcon name="email" size={18} decorative /></span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium text-neutral-800 truncate">
                  {item.title}
                </span>
                {item.description && (
                  <span className="text-xs text-neutral-500 truncate">
                    {item.description}
                  </span>
                )}
                <span className="text-xs text-neutral-400 mt-0.5">
                  {item.email_from || item.email_subject}
                </span>
              </div>
              {item.due_date && (
                <span className={`text-xs font-medium flex-shrink-0 ${isOverdue ? 'text-red-500' : 'text-neutral-400'}`}>
                  {formatDate(item.due_date)}
                </span>
              )}
              {item.urgency === 'urgent' && (
                <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0 animate-pulse" />
              )}
              {/* Action buttons - show on hover */}
              <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); onAcknowledge(item.id) }}
                  className="text-xs px-2 py-1 rounded-md bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors"
                  title="Got it"
                >
                  <ConceptIcon name="done" decorative />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onSnooze(item.id) }}
                  className="text-xs px-2 py-1 rounded-md bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors"
                  title="Snooze until tomorrow"
                >
                  <ConceptIcon name="time" decorative />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDismiss(item.id) }}
                  className="text-xs px-2 py-1 rounded-md bg-neutral-100 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 transition-colors"
                  title="Dismiss"
                >
                  <ConceptIcon name="close" decorative />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {!expanded && activeItems.length > 3 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-neutral-400 hover:text-neutral-600 mt-2 transition-colors"
        >
          +{activeItems.length - 3} more
        </button>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  const due = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d late`
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
