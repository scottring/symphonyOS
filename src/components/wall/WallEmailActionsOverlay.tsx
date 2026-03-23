import { useState, useEffect, useCallback } from 'react'
import type { EmailActionItem, EmailActionCategory } from '@/types/emailAction'
import { CATEGORY_CONFIG } from '@/types/emailAction'
import { WallEmailActionCard } from './WallEmailActionCard'
import type { FamilyMember } from '@/types/family'

interface WallEmailActionsOverlayProps {
  items: EmailActionItem[]
  familyMembers: FamilyMember[]
  onAcknowledge: (id: string) => void
  onSnooze: (id: string) => void
  onDismiss: (id: string) => void
  onDone: (id: string) => void
  onClose: () => void
}

const CATEGORY_ORDER: EmailActionCategory[] = ['school', 'social', 'household', 'financial', 'medical']

export function WallEmailActionsOverlay({
  items,
  familyMembers,
  onAcknowledge,
  onSnooze,
  onDismiss,
  onDone,
  onClose,
}: WallEmailActionsOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(timer)
  }, [])

  const handleClose = useCallback(() => {
    setExiting(true)
    setTimeout(onClose, 400)
  }, [onClose])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleClose])

  // Group items by category
  const grouped = CATEGORY_ORDER
    .map(cat => ({
      category: cat,
      config: CATEGORY_CONFIG[cat],
      items: items.filter(i => i.category === cat),
    }))
    .filter(g => g.items.length > 0)

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-400
                  ${visible && !exiting ? 'bg-black/80 backdrop-blur-md' : 'bg-transparent'}`}
      onClick={handleClose}
    >
      <div
        className={`w-[1600px] max-h-[900px] overflow-y-auto rounded-[2rem] bg-[#1a1a1a] border border-white/10
                    p-10 transition-all duration-400
                    ${visible && !exiting ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <span className="text-[3rem]">📬</span>
            <div>
              <h1 className="text-white font-black text-[2rem] leading-none tracking-tight">
                Action Items
              </h1>
              <p className="text-white/40 font-bold text-[1rem] mt-1">
                {items.length} item{items.length !== 1 ? 's' : ''} from email
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center
                       text-white/50 hover:text-white hover:bg-white/20 transition-all text-[1.5rem]"
          >
            ✕
          </button>
        </div>

        {/* Categories */}
        <div className="space-y-8">
          {grouped.map(({ category, config, items: catItems }) => (
            <div key={category}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[1.5rem]">{config.icon}</span>
                <h2 className="font-black uppercase tracking-widest text-[0.8rem]" style={{ color: config.color }}>
                  {config.label}
                </h2>
                <span className="text-white/20 font-bold text-[0.7rem]">{catItems.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {catItems.map(item => (
                  <WallEmailActionCard
                    key={item.id}
                    item={item}
                    familyMembers={familyMembers}
                    onAcknowledge={onAcknowledge}
                    onSnooze={onSnooze}
                    onDismiss={onDismiss}
                    onDone={onDone}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <div className="text-center py-20">
            <span className="text-[4rem]">✨</span>
            <p className="text-white/40 font-bold text-[1.2rem] mt-4">All clear — no action items</p>
          </div>
        )}
      </div>
    </div>
  )
}
