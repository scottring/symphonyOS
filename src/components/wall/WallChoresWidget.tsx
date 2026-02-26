import { useCallback, useState, useRef } from 'react'
import type { TimelineItem } from '@/types/timeline'
import confetti from 'canvas-confetti'

interface WallChoresWidgetProps {
  items: TimelineItem[]
  onComplete: (item: TimelineItem) => void
  overdueItems: TimelineItem[]
  inboxCount: number
  completedCount: number
  totalCount: number
}

const CARD_COLORS = [
  { bg: 'bg-[#6DC4A7]', text: 'text-white' },
  { bg: 'bg-[#F9C35C]', text: 'text-white' },
  { bg: 'bg-[#F26E63]', text: 'text-white' },
  { bg: 'bg-[#6DC4A7]', text: 'text-white' },
  { bg: 'bg-[#F9C35C]', text: 'text-white' },
  { bg: 'bg-[#F26E63]', text: 'text-white' },
]

function getEmojiIcon(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('walk') && lower.includes('jax')) return '🐕'
  if (lower.includes('teeth')) return '🪥'
  if (lower.includes('jax') || lower.includes('dog') || lower.includes('feed')) return '🦴'
  if (lower.includes('read') || lower.includes('book')) return '📚'
  if (lower.includes('bed') || lower.includes('sleep') || lower.includes('routine')) return '🛏️'
  if (lower.includes('clean') || lower.includes('tidy') || lower.includes('kitchen')) return '🧹'
  if (lower.includes('trash') || lower.includes('garbage')) return '🗑️'
  if (lower.includes('dress') || lower.includes('clothes')) return '👕'
  if (lower.includes('homework')) return '📝'
  if (lower.includes('pick') && lower.includes('up')) return '🦶'
  if (lower.includes('school') || lower.includes('walk kids')) return '🎒'
  if (lower.includes('dinner') || lower.includes('meal') || lower.includes('cook')) return '🍽️'
  if (lower.includes('shower') || lower.includes('bath')) return '🚿'
  if (lower.includes('cancel') || lower.includes('call') || lower.includes('phone')) return '📞'
  if (lower.includes('plan') || lower.includes('childcare') || lower.includes('find')) return '📋'
  return '⭐'
}

// Grid: 2 rows x 3 cols of 120px squares with 12px gaps
const SQ = 120
const GAP = 12

export function WallChoresWidget({ items, onComplete, overdueItems, inboxCount, completedCount, totalCount }: WallChoresWidgetProps) {
  const displayItems = items.slice(0, 6)
  const overdueDisplay = overdueItems.filter(i => !i.completed).slice(0, 5)

  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, item: TimelineItem) => {
    if (item.completed) {
      onComplete(item)
      return
    }
    setPressingId(item.id)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (rect.left + rect.width / 2) / window.innerWidth
    const y = (rect.top + rect.height / 2) / window.innerHeight
    timeoutRef.current = setTimeout(() => {
      setPressingId(null)
      confetti({ particleCount: 80, spread: 60, origin: { x, y }, colors: ['#6DC4A7', '#F9C35C', '#F26E63', '#FFFFFF'] })
      setTimeout(() => onComplete(item), 300)
    }, 700)
  }, [onComplete])

  const handlePointerCancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setPressingId(null)
  }, [])

  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const gridHeight = SQ * 2 + GAP
  const cols = Math.min(3, Math.max(1, Math.ceil(displayItems.length / 2)))

  return (
    <div className="flex gap-6" style={{ height: gridHeight }}>
      {/* ── Chore Grid (square of squares) ── */}
      {displayItems.length > 0 ? (
        <div
          className="flex-shrink-0 grid gap-[12px]"
          style={{ gridTemplateColumns: `repeat(${cols}, ${SQ}px)`, gridTemplateRows: `repeat(2, ${SQ}px)` }}
        >
          {displayItems.map((item, index) => {
            const theme = CARD_COLORS[index % CARD_COLORS.length]
            const icon = getEmojiIcon(item.title)
            const isCompleted = item.completed
            const bgClass = isCompleted ? 'bg-slate-700/60' : theme.bg
            const isPressing = pressingId === item.id

            return (
              <button
                key={item.id}
                onPointerDown={(e) => handlePointerDown(e, item)}
                onPointerUp={handlePointerCancel}
                onPointerLeave={handlePointerCancel}
                onPointerCancel={handlePointerCancel}
                className={`rounded-[1.2rem] ${bgClass} ${theme.text} flex flex-col items-center justify-center shadow-lg relative overflow-hidden transition-all duration-300 ${isPressing ? 'scale-95' : 'active:scale-95'} ${isCompleted ? 'opacity-80' : ''} group select-none`}
                style={{ touchAction: 'none' }}
              >
                {/* Hold fill */}
                {!isCompleted && (
                  <div className={`absolute inset-0 bg-white/20 origin-bottom transition-all pointer-events-none z-10 ${isPressing ? 'scale-y-100 duration-700 ease-linear' : 'scale-y-0 duration-150 ease-out'}`} />
                )}
                {/* Completed overlay */}
                {isCompleted && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 z-10 backdrop-blur-[2px]">
                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center shadow-2xl">
                      <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                  </div>
                )}
                <div className={`text-[2.8rem] drop-shadow-md transition-transform ${isCompleted ? 'scale-75 opacity-50' : ''}`}>
                  {icon}
                </div>
                <span className={`font-black text-[0.75rem] uppercase tracking-wider text-center px-1.5 leading-tight mt-0.5 ${isCompleted ? 'text-white/60' : ''}`} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.title}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: SQ, height: gridHeight }}>
          <div className="text-center opacity-50">
            <span className="text-[3rem]">🎉</span>
            <div className="text-[0.85rem] font-black text-white mt-1 uppercase tracking-widest">All Done!</div>
          </div>
        </div>
      )}

      {/* ── Info Panel (overdue, inbox, progress) ── */}
      <div className="flex-1 rounded-[1.5rem] bg-white/8 backdrop-blur-sm border border-white/10 p-5 flex flex-col min-w-0 overflow-hidden gap-3">
        {/* Progress bar (no label) */}
        <div className="w-full h-2 rounded-full bg-white/10 flex-shrink-0">
          <div className="h-full rounded-full bg-[#6DC4A7] transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Overdue items — checkoffable 2-column grid */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {overdueDisplay.length > 0 ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#F26E63] animate-pulse" />
                <span className="text-[0.95rem] font-black text-[#F26E63] uppercase tracking-widest">
                  Overdue ({overdueItems.filter(i => !i.completed).length})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 flex-1 overflow-hidden">
                {overdueDisplay.map((item) => {
                  const isPressing = pressingId === item.id
                  return (
                    <button
                      key={item.id}
                      onPointerDown={(e) => handlePointerDown(e, item)}
                      onPointerUp={handlePointerCancel}
                      onPointerLeave={handlePointerCancel}
                      onPointerCancel={handlePointerCancel}
                      className={`flex items-center gap-2.5 bg-white/5 rounded-xl px-3 py-2.5 relative overflow-hidden transition-all duration-300 select-none text-left ${isPressing ? 'scale-[0.97]' : 'active:scale-[0.97]'}`}
                      style={{ touchAction: 'none' }}
                    >
                      {/* Hold fill */}
                      <div className={`absolute inset-0 bg-[#6DC4A7]/30 origin-left transition-all pointer-events-none ${isPressing ? 'scale-x-100 duration-700 ease-linear' : 'scale-x-0 duration-150 ease-out'}`} />
                      <span className="text-[1.2rem] flex-shrink-0 relative z-10">{getEmojiIcon(item.title)}</span>
                      <span className="text-[0.9rem] font-bold text-white/80 truncate relative z-10">{item.title}</span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <span className="text-[2.5rem]">✨</span>
                <span className="text-[1.1rem] font-bold text-white/50 uppercase tracking-wider">Nothing overdue</span>
              </div>
            </div>
          )}
        </div>

        {/* Inbox badge */}
        {inboxCount > 0 && (
          <div className="flex items-center justify-center gap-2 bg-[#F9C35C]/20 rounded-xl px-4 py-2 flex-shrink-0">
            <span className="text-[1rem]">📥</span>
            <span className="text-[1.2rem] font-black text-[#F9C35C]">{inboxCount}</span>
            <span className="text-[0.75rem] font-bold text-white/50 uppercase">inbox</span>
          </div>
        )}
      </div>
    </div>
  )
}
