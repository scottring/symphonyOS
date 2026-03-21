import { useCallback, useState, useRef } from 'react'
import type { TimelineItem } from '@/types/timeline'
import confetti from 'canvas-confetti'

interface WallRoutineColumnProps {
  choreItems: TimelineItem[]
  onComplete: (item: TimelineItem) => void
}

const CARD_COLORS = [
  '#6DC4A7',
  '#F9C35C',
  '#F26E63',
]

function getEmojiIcon(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('walk') && lower.includes('jax')) return '🐕'
  if (lower.includes('teeth') || lower.includes('brush')) return '🪥'
  if (lower.includes('jax') || lower.includes('dog') || lower.includes('feed')) return '🦴'
  if (lower.includes('read') || lower.includes('book')) return '📚'
  if (lower.includes('bed') || lower.includes('sleep')) return '🛏️'
  if (lower.includes('clean') || lower.includes('tidy') || lower.includes('kitchen')) return '🧹'
  if (lower.includes('trash') || lower.includes('garbage')) return '🗑️'
  if (lower.includes('dress') || lower.includes('clothes')) return '👕'
  if (lower.includes('homework')) return '📝'
  if (lower.includes('pick') && lower.includes('up')) return '🚶'
  if (lower.includes('school') || lower.includes('walk kids')) return '🎒'
  if (lower.includes('dinner') || lower.includes('meal') || lower.includes('cook')) return '🍽️'
  if (lower.includes('shower') || lower.includes('bath')) return '🚿'
  if (lower.includes('call') || lower.includes('phone')) return '📞'
  if (lower.includes('plan') || lower.includes('childcare')) return '📋'
  if (lower.includes('soccer') || lower.includes('practice')) return '⚽'
  if (lower.includes('piano') || lower.includes('music')) return '🎹'
  if (lower.includes('medicine') || lower.includes('med')) return '💊'
  if (lower.includes('water') || lower.includes('plant')) return '🌱'
  return '⭐'
}

function formatItemTime(item: TimelineItem): string | null {
  if (!item.startTime) return null
  const d = new Date(item.startTime)
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'p' : 'a'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${period}` : `${hour}:${m.toString().padStart(2, '0')}${period}`
}

export function WallRoutineColumn({ choreItems, onComplete }: WallRoutineColumnProps) {
  const incomplete = choreItems.filter(i => !i.completed)
  const completed = choreItems.filter(i => i.completed)

  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, item: TimelineItem) => {
    if (item.completed) {
      onComplete(item) // undo
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

  const allItems = [...incomplete, ...completed]

  return (
    <div className="flex flex-col h-full">
      <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50 mb-4">
        Routines
      </div>

      {allItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center opacity-50">
            <span className="text-[3rem]">🎉</span>
            <div className="text-[0.85rem] font-black text-white mt-1 uppercase tracking-widest">All Done!</div>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {allItems.map((item, index) => {
            const color = CARD_COLORS[index % CARD_COLORS.length]
            const icon = getEmojiIcon(item.title)
            const timeStr = formatItemTime(item)
            const isPressing = pressingId === item.id
            const isDone = item.completed

            return (
              <button
                key={item.id}
                onPointerDown={(e) => handlePointerDown(e, item)}
                onPointerUp={handlePointerCancel}
                onPointerLeave={handlePointerCancel}
                onPointerCancel={handlePointerCancel}
                className={`relative rounded-[1.2rem] flex items-center gap-3 px-4 py-3 shadow-lg overflow-hidden transition-all duration-300 select-none ${isPressing ? 'scale-95' : 'active:scale-95'} ${isDone ? 'opacity-40' : ''}`}
                style={{ backgroundColor: isDone ? 'rgba(255,255,255,0.06)' : color, touchAction: 'none', minHeight: 72 }}
              >
                {/* Hold fill */}
                {!isDone && (
                  <div
                    className={`absolute inset-0 bg-white/20 origin-bottom pointer-events-none z-10 ${isPressing ? 'scale-y-100 duration-700 ease-linear' : 'scale-y-0 duration-150 ease-out'}`}
                    style={{ transition: 'transform' }}
                  />
                )}

                {/* Completed checkmark */}
                {isDone && (
                  <div className="absolute top-2 right-2 text-[0.9rem] z-20">✅</div>
                )}

                {/* Time badge */}
                {timeStr && !isDone && (
                  <div className="absolute top-1.5 right-2 text-[0.65rem] font-black text-white/70 uppercase z-20">
                    {timeStr}
                  </div>
                )}

                {/* Icon */}
                <div className="text-[2rem] drop-shadow-md flex-shrink-0">
                  {icon}
                </div>

                {/* Title */}
                <span
                  className={`font-black text-[0.75rem] uppercase tracking-wider leading-tight flex-1 text-left ${isDone ? 'text-white/50 line-through' : 'text-white'}`}
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {item.title}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
