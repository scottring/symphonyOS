import { useCallback, useState, useRef } from 'react'
import type { TimelineItem } from '@/types/timeline'
import confetti from 'canvas-confetti'

interface WallChoresWidgetProps {
  choreItems: TimelineItem[]
  taskItems: TimelineItem[]
  onComplete: (item: TimelineItem) => void
  overdueItems: TimelineItem[]
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
  if (lower.includes('pick') && lower.includes('up')) return '🚶'
  if (lower.includes('school') || lower.includes('walk kids')) return '🎒'
  if (lower.includes('dinner') || lower.includes('meal') || lower.includes('cook')) return '🍽️'
  if (lower.includes('shower') || lower.includes('bath')) return '🚿'
  if (lower.includes('cancel') || lower.includes('call') || lower.includes('phone')) return '📞'
  if (lower.includes('plan') || lower.includes('childcare') || lower.includes('find')) return '📋'
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

// Chore grid constants
const SQ = 120
const GAP = 12

export function WallChoresWidget({ choreItems, taskItems, onComplete, overdueItems }: WallChoresWidgetProps) {
  const displayChores = choreItems.filter(i => !i.completed).slice(0, 6)
  const overdueDisplay = overdueItems.filter(i => !i.completed)

  // Combine today's tasks + overdue into one list, marking which are overdue
  const overdueIds = new Set(overdueDisplay.map(i => i.id))
  const allTasks = [
    ...taskItems.filter(i => !i.completed),
    ...overdueDisplay,
  ]

  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleChorePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, item: TimelineItem) => {
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

  const choreCols = Math.min(3, Math.max(1, Math.ceil(displayChores.length / 2)))

  return (
    <div className="flex gap-8 w-full">
      {/* ── LEFT: Chores Section ── */}
      <div className="flex-shrink-0 flex flex-col">
        <div className="text-[1.3rem] font-bold uppercase tracking-[0.2em] text-white mb-4">
          Chores
        </div>

        {displayChores.length > 0 ? (
          <div
            className="grid gap-[12px]"
            style={{ gridTemplateColumns: `repeat(${choreCols}, ${SQ}px)`, gridTemplateRows: `repeat(2, ${SQ}px)` }}
          >
            {displayChores.map((item, index) => {
              const theme = CARD_COLORS[index % CARD_COLORS.length]
              const icon = getEmojiIcon(item.title)
              const timeStr = formatItemTime(item)
              const isPressing = pressingId === item.id

              return (
                <button
                  key={item.id}
                  onPointerDown={(e) => handleChorePointerDown(e, item)}
                  onPointerUp={handlePointerCancel}
                  onPointerLeave={handlePointerCancel}
                  onPointerCancel={handlePointerCancel}
                  className={`rounded-[1.2rem] ${theme.bg} ${theme.text} flex flex-col items-center justify-center shadow-lg relative overflow-hidden transition-all duration-300 ${isPressing ? 'scale-95' : 'active:scale-95'} group select-none`}
                  style={{ touchAction: 'none' }}
                >
                  {/* Hold fill */}
                  <div className={`absolute inset-0 bg-white/20 origin-bottom transition-all pointer-events-none z-10 ${isPressing ? 'scale-y-100 duration-700 ease-linear' : 'scale-y-0 duration-150 ease-out'}`} />
                  {/* Time badge */}
                  {timeStr && (
                    <div className="absolute top-1.5 right-2 text-[0.65rem] font-black text-white/70 uppercase z-20">
                      {timeStr}
                    </div>
                  )}
                  <div className="text-[2.8rem] drop-shadow-md">
                    {icon}
                  </div>
                  <span className="font-black text-[0.7rem] uppercase tracking-wider text-center px-1.5 leading-tight mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.title}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center" style={{ width: SQ * 2 + GAP, height: SQ * 2 + GAP }}>
            <div className="text-center opacity-50">
              <span className="text-[3rem]">🎉</span>
              <div className="text-[0.85rem] font-black text-white mt-1 uppercase tracking-widest">All Done!</div>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Tasks Section ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="text-[1.3rem] font-bold uppercase tracking-[0.2em] text-white mb-4">
          Tasks
        </div>

        {allTasks.length > 0 ? (
          <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: SQ * 2 + GAP + 30, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            {allTasks.map((item) => {
              const isOverdue = overdueIds.has(item.id)
              const icon = getEmojiIcon(item.title)
              const timeStr = formatItemTime(item)

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 bg-white/6 rounded-xl px-4 py-2.5 select-none"
                >
                  {/* Icon */}
                  <span className="text-[1.1rem] flex-shrink-0">{icon}</span>
                  {/* Title */}
                  <span className="text-[0.95rem] font-bold text-white/85 truncate flex-1">{item.title}</span>
                  {/* Time */}
                  {timeStr && (
                    <span className="text-[0.75rem] font-bold text-white/40 uppercase flex-shrink-0">{timeStr}</span>
                  )}
                  {/* Overdue indicator */}
                  {isOverdue && (
                    <div className="w-2.5 h-2.5 rounded-full bg-[#F9A825] flex-shrink-0 animate-pulse" />
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center" style={{ height: SQ * 2 + GAP }}>
            <div className="text-center opacity-50">
              <span className="text-[2.5rem]">✨</span>
              <div className="text-[0.85rem] font-black text-white mt-1 uppercase tracking-widest">No tasks today</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
