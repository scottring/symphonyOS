import { useCallback, useState, useRef } from 'react'
import type { TimelineItem } from '@/types/timeline'
import confetti from 'canvas-confetti'

interface WallChoresWidgetProps {
  items: TimelineItem[]
  onComplete: (item: TimelineItem) => void
}

const CARD_COLORS = [
  { bg: 'bg-[#6DC4A7]', text: 'text-white', progressBg: 'bg-white/30', progressFill: 'bg-[#F25F4C]' },
  { bg: 'bg-[#F9C35C]', text: 'text-white', progressBg: 'bg-white/30', progressFill: 'bg-[#6DC4A7]' },
  { bg: 'bg-[#F26E63]', text: 'text-white', progressBg: 'bg-white/30', progressFill: 'bg-[#F9C35C]' },
]

// Simple heuristic for 3D icons based on title
function getEmojiIcon(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('teeth')) return '🪥'
  if (lower.includes('jax') || lower.includes('dog') || lower.includes('feed')) return '🦴'
  if (lower.includes('read') || lower.includes('book')) return '📚'
  if (lower.includes('bed') || lower.includes('sleep')) return '🛏️'
  if (lower.includes('clean') || lower.includes('tidy')) return '🧹'
  if (lower.includes('trash') || lower.includes('garbage')) return '🗑️'
  if (lower.includes('dress') || lower.includes('clothes')) return '👕'
  return '⭐'
}

export function WallChoresWidget({ items, onComplete }: WallChoresWidgetProps) {
  // Show up to 3 items. Prioritize uncompleted, but if completed today, show them as completed.
  const displayItems = items.slice(0, 3)

  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, item: TimelineItem) => {
    if (item.completed) {
      // It's already done. Un-do it immediately on tap.
      onComplete(item)
      return
    }

    setPressingId(item.id)

    // Store coords for confetti immediately
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (rect.left + rect.width / 2) / window.innerWidth
    const y = (rect.top + rect.height / 2) / window.innerHeight

    // Wait 700ms to register as a "hold to complete"
    timeoutRef.current = setTimeout(() => {
      setPressingId(null)
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { x, y },
        colors: ['#6DC4A7', '#F9C35C', '#F26E63', '#FFFFFF']
      })
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

  if (displayItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center opacity-50">
        <span className="text-[6rem]">🎉</span>
        <h2 className="text-[2rem] font-black text-white mt-4 uppercase tracking-widest text-center">
          Nothing Scheduled!
        </h2>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-[300px]">
      {displayItems.map((item, index) => {
        const theme = CARD_COLORS[index % CARD_COLORS.length]
        const icon = getEmojiIcon(item.title)

        // If it is completed, we override the theme to be greyed out
        const isCompleted = item.completed
        const bgClass = isCompleted ? 'bg-slate-700/60' : theme.bg
        const opacityClass = isCompleted ? 'opacity-80' : 'opacity-100'

        // For demo purposes, visually simulate progress
        const progressWidth = isCompleted ? '100%' : (index === 0 ? '20%' : index === 1 ? '10%' : '50%')

        const isPressing = pressingId === item.id

        let transformClass = 'active:scale-95'
        if (isPressing) transformClass = 'scale-95'

        return (
          <button
            key={item.id}
            onPointerDown={(e) => handlePointerDown(e, item)}
            onPointerUp={handlePointerCancel}
            onPointerLeave={handlePointerCancel}
            onPointerCancel={handlePointerCancel}
            className={`flex-1 rounded-[2.5rem] ${bgClass} ${theme.text} p-6 flex flex-col items-center justify-between shadow-lg relative overflow-hidden transition-all duration-300 ${transformClass} ${opacityClass} group select-none`}
            style={{ touchAction: 'none' }}
          >
            {/* Visual indicator for Hold-To-Complete */}
            {!isCompleted && (
              <div
                className={`absolute inset-0 bg-white/20 origin-bottom transition-all pointer-events-none z-10 ${isPressing ? 'scale-y-100 duration-700 ease-linear' : 'scale-y-0 duration-150 ease-out'
                  }`}
              />
            )}

            {/* Hold instructions overlay */}
            {!isCompleted && !isPressing && (
              <div className="absolute top-4 right-4 opacity-40 group-hover:opacity-100 transition-opacity font-bold uppercase tracking-widest bg-black/10 px-3 py-1 rounded-full text-[0.8rem]">
                Hold to Complete
              </div>
            )}

            {/* Massive Overlay Checkmark if completed */}
            {isCompleted && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 z-10 backdrop-blur-[2px]">
                <div className="w-32 h-32 rounded-full bg-green-500 flex items-center justify-center shadow-2xl transform scale-100 animate-fade-in-scale">
                  <svg className="w-16 h-16 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                {/* Undo text on hover */}
                <div className="absolute bottom-6 opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase tracking-widest bg-slate-900/60 px-4 py-1 rounded-full text-white/90">
                  Tap to Undo
                </div>
              </div>
            )}

            <div className={`text-[7rem] drop-shadow-md mt-4 transition-transform ${isCompleted ? 'scale-90 opacity-50' : ''}`}>
              {icon}
            </div>

            <div className="w-full flex flex-col items-center gap-4 mt-auto relative z-0">
              <span className={`font-black text-[1.4rem] uppercase tracking-wider text-center px-2 leading-tight ${isCompleted ? 'text-white/60' : ''}`}>
                {item.title}
              </span>

              <div className={`w-[70%] h-3 rounded-full ${isCompleted ? 'bg-slate-800' : theme.progressBg} relative overflow-hidden`}>
                <div
                  className={`absolute left-0 top-0 bottom-0 ${isCompleted ? 'bg-green-500' : theme.progressFill} transition-all duration-1000`}
                  style={{ width: progressWidth }}
                />
              </div>

              {/* Little bouncing arrow at bottom */}
              {!isCompleted && (
                <svg className="w-6 h-6 opacity-60 mt-1 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
