import { useCallback, useState, useRef } from 'react'
import type { EmailActionItem } from '@/types/emailAction'
import { CATEGORY_CONFIG } from '@/types/emailAction'
import type { FamilyMember } from '@/types/family'

interface WallEmailActionCardProps {
  item: EmailActionItem
  familyMembers?: FamilyMember[]
  onAcknowledge: (id: string) => void
  onSnooze: (id: string) => void
  onDismiss: (id: string) => void
  onDone: (id: string) => void
  compact?: boolean
}

function formatDueDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  const due = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function WallEmailActionCard({
  item,
  familyMembers,
  onAcknowledge,
  onSnooze,
  onDismiss,
  onDone,
  compact = false,
}: WallEmailActionCardProps) {
  const [showActions, setShowActions] = useState(false)
  const longPressRef = useRef<NodeJS.Timeout | null>(null)
  const cat = CATEGORY_CONFIG[item.category]
  const dueLabel = formatDueDate(item.due_date)
  const isOverdue = item.due_date && new Date(item.due_date + 'T00:00:00') < new Date(new Date().toDateString())

  const relevantMember = familyMembers?.find(m => m.id === item.relevant_member_id)

  const handleTouchStart = useCallback(() => {
    longPressRef.current = setTimeout(() => {
      setShowActions(true)
    }, 600)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }, [])

  const handleTap = useCallback(() => {
    if (showActions) {
      setShowActions(false)
    } else if (item.status === 'new') {
      onAcknowledge(item.id)
    }
  }, [showActions, item, onAcknowledge])

  if (compact) {
    return (
      <div className="flex items-center gap-3 py-1.5">
        <span className="text-[1.4rem] flex-shrink-0">{cat.icon}</span>
        <span className="text-white font-bold text-[0.95rem] truncate flex-1">{item.title}</span>
        {dueLabel && (
          <span className={`text-[0.7rem] font-black uppercase tracking-widest flex-shrink-0 ${isOverdue ? 'text-red-400' : 'text-white/40'}`}>
            {dueLabel}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className="relative rounded-xl bg-white/[0.06] border border-white/[0.08] px-5 py-4 cursor-pointer
                 hover:bg-white/[0.1] transition-all active:scale-[0.98]"
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ touchAction: 'manipulation' }}
    >
      <div className="flex items-center gap-4">
        {/* Category icon */}
        <div className="text-[2.2rem] flex-shrink-0">{cat.icon}</div>

        {/* Content */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-black uppercase tracking-widest text-[0.6rem]" style={{ color: cat.color }}>
              {cat.label}
            </span>
            {item.urgency === 'urgent' && (
              <span className="text-red-400 font-black uppercase tracking-widest text-[0.55rem]">
                Urgent
              </span>
            )}
            {item.status === 'new' && (
              <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
            )}
          </div>
          <span className="text-white font-bold text-[1.1rem] leading-tight truncate">
            {item.title}
          </span>
          {item.email_from && (
            <span className="text-white/30 text-[0.75rem] truncate">
              from {item.email_from}
            </span>
          )}
        </div>

        {/* Right side: due date + member */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {dueLabel && (
            <span className={`text-[0.7rem] font-black uppercase tracking-widest ${isOverdue ? 'text-red-400' : 'text-white/40'}`}>
              {dueLabel}
            </span>
          )}
          {relevantMember && (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[0.6rem] font-black text-white"
              style={{ backgroundColor: relevantMember.color }}
            >
              {relevantMember.initials}
            </div>
          )}
        </div>
      </div>

      {/* Long-press action buttons */}
      {showActions && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/10">
          <button
            onClick={(e) => { e.stopPropagation(); onDone(item.id) }}
            className="flex-1 py-3 rounded-xl bg-green-500/20 text-green-400 font-black text-[0.7rem] uppercase tracking-widest
                       border border-green-500/30 active:scale-95 transition-transform"
          >
            Done
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSnooze(item.id) }}
            className="flex-1 py-3 rounded-xl bg-amber-500/20 text-amber-400 font-black text-[0.7rem] uppercase tracking-widest
                       border border-amber-500/30 active:scale-95 transition-transform"
          >
            Tomorrow
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(item.id) }}
            className="flex-1 py-3 rounded-xl bg-red-500/20 text-red-400 font-black text-[0.7rem] uppercase tracking-widest
                       border border-red-500/30 active:scale-95 transition-transform"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Amount badge */}
      {item.amount_cents != null && item.amount_cents > 0 && (
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/30">
          <span className="text-amber-400 font-black text-[0.7rem]">
            ${(item.amount_cents / 100).toFixed(item.amount_cents % 100 === 0 ? 0 : 2)}
          </span>
        </div>
      )}
    </div>
  )
}
