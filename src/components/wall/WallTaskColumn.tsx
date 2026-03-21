import { useCallback, useState, useRef } from 'react'
import type { TimelineItem } from '@/types/timeline'
import confetti from 'canvas-confetti'

interface WallTaskColumnProps {
  taskItems: TimelineItem[]
  onComplete: (item: TimelineItem) => void
  onItemTap?: (item: TimelineItem) => void
}

function getEmojiIcon(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('grocery') || lower.includes('shop')) return '🛒'
  if (lower.includes('call') || lower.includes('phone')) return '📞'
  if (lower.includes('email') || lower.includes('send')) return '📧'
  if (lower.includes('pick up') || lower.includes('pickup')) return '🚗'
  if (lower.includes('doctor') || lower.includes('dentist') || lower.includes('appointment')) return '🏥'
  if (lower.includes('school')) return '🎒'
  if (lower.includes('soccer') || lower.includes('practice')) return '⚽'
  if (lower.includes('piano') || lower.includes('music') || lower.includes('lesson')) return '🎹'
  if (lower.includes('birthday') || lower.includes('party')) return '🎂'
  if (lower.includes('cook') || lower.includes('dinner') || lower.includes('meal')) return '🍽️'
  if (lower.includes('clean') || lower.includes('tidy')) return '🧹'
  if (lower.includes('fix') || lower.includes('repair')) return '🔧'
  if (lower.includes('pay') || lower.includes('bill')) return '💳'
  if (lower.includes('plan') || lower.includes('schedule')) return '📋'
  if (lower.includes('buy') || lower.includes('order') || lower.includes('return')) return '📦'
  if (lower.includes('walk') || lower.includes('jax') || lower.includes('dog')) return '🐕'
  if (lower.includes('med') || lower.includes('prescription')) return '💊'
  return '📌'
}

export function WallTaskColumn({ taskItems, onComplete, onItemTap }: WallTaskColumnProps) {
  const incomplete = taskItems.filter(t => !t.completed)
  const completed = taskItems.filter(t => t.completed)

  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pointerDownTime = useRef(0)

  const handlePointerDown = useCallback((e: React.PointerEvent, item: TimelineItem) => {
    pointerDownTime.current = Date.now()
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

  const handlePointerUp = useCallback((item: TimelineItem) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setPressingId(null)
    const elapsed = Date.now() - pointerDownTime.current
    if (elapsed < 300 && onItemTap) {
      onItemTap(item)
    }
  }, [onItemTap])

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
      <div className="flex items-center justify-between mb-4">
        <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50">
          Tasks
        </div>
        {allItems.length > 0 && (
          <div className="text-[0.75rem] font-bold text-white/30">
            {completed.length}/{allItems.length}
          </div>
        )}
      </div>

      {allItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center opacity-50">
            <span className="text-[2.5rem]">✨</span>
            <div className="text-[0.8rem] font-black text-white mt-1 uppercase tracking-widest">No Tasks</div>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {allItems.map(item => {
            const isPressing = pressingId === item.id
            const isDone = item.completed
            const icon = getEmojiIcon(item.title)

            return (
              <div
                key={item.id}
                onPointerDown={(e) => handlePointerDown(e, item)}
                onPointerUp={() => handlePointerUp(item)}
                onPointerLeave={handlePointerCancel}
                onPointerCancel={handlePointerCancel}
                className={`relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-300 select-none cursor-pointer ${
                  isPressing ? 'bg-white/15 scale-[0.97]' : 'bg-white/[0.05] hover:bg-white/[0.08]'
                } ${isDone ? 'opacity-40' : ''}`}
                style={{ touchAction: 'none' }}
              >
                {/* Hold fill */}
                {!isDone && (
                  <div
                    className={`absolute inset-0 rounded-xl bg-white/10 origin-left pointer-events-none ${
                      isPressing ? 'scale-x-100 duration-700 ease-linear' : 'scale-x-0 duration-150 ease-out'
                    }`}
                    style={{ transition: 'transform' }}
                  />
                )}

                <span className="text-[1rem] flex-shrink-0 relative z-10">{icon}</span>
                <span
                  className={`text-[0.8rem] font-bold leading-tight flex-1 relative z-10 ${
                    isDone ? 'text-white/40 line-through' : 'text-white/80'
                  }`}
                  style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {item.title}
                </span>

                {isDone && (
                  <span className="text-[0.75rem] relative z-10">✅</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
