import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import type { TimelineItem } from '@/types/timeline'
import { groupTasksByRoom } from './roomConfig'
import confetti from 'canvas-confetti'

interface WallRoomsViewProps {
  roomTasks: TimelineItem[]
  adultTasks: TimelineItem[]
  onComplete: (item: TimelineItem) => void
  onItemTap?: (item: TimelineItem) => void
}

function getEmojiIcon(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('walk') && lower.includes('jax')) return '🐕'
  if (lower.includes('teeth') || lower.includes('brush')) return '🪥'
  if (lower.includes('jax') || lower.includes('dog') || lower.includes('feed')) return '🦴'
  if (lower.includes('read') || lower.includes('book')) return '📚'
  if (lower.includes('clean') || lower.includes('tidy')) return '🧹'
  if (lower.includes('trash') || lower.includes('garbage')) return '🗑️'
  if (lower.includes('dishes') || lower.includes('dishwasher')) return '🍽️'
  if (lower.includes('vacuum')) return '🧹'
  if (lower.includes('laundry') || lower.includes('fold') || lower.includes('clothes')) return '👕'
  if (lower.includes('bed') || lower.includes('sheet')) return '🛏️'
  if (lower.includes('mow') || lower.includes('lawn') || lower.includes('yard')) return '🌿'
  if (lower.includes('wipe') || lower.includes('counter') || lower.includes('scrub')) return '🧽'
  if (lower.includes('organize') || lower.includes('sort')) return '📦'
  if (lower.includes('sweep')) return '🧹'
  if (lower.includes('toy') || lower.includes('lego') || lower.includes('game')) return '🧸'
  return '○'
}

export function WallRoomsView({ roomTasks, adultTasks, onComplete, onItemTap }: WallRoomsViewProps) {
  const roomGroups = useMemo(() => groupTasksByRoom(roomTasks.filter(t => !t.completed)), [roomTasks])
  const completedCount = roomTasks.filter(t => t.completed).length
  const totalCount = roomTasks.length
  const allClear = roomGroups.length === 0 && totalCount > 0

  // ─── Long-press completion (room tasks) ───
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
    // Short tap → open detail
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

  // ─── Adult task double-tap lock ───
  const [adultUnlocked, setAdultUnlocked] = useState(false)
  const adultTapCount = useRef(0)
  const adultTapTimer = useRef<NodeJS.Timeout | null>(null)
  const adultLockTimer = useRef<NodeJS.Timeout | null>(null)

  const handleLockTap = useCallback(() => {
    if (adultUnlocked) return
    adultTapCount.current += 1
    if (adultTapCount.current >= 2) {
      setAdultUnlocked(true)
      adultTapCount.current = 0
    }
    if (adultTapTimer.current) clearTimeout(adultTapTimer.current)
    adultTapTimer.current = setTimeout(() => { adultTapCount.current = 0 }, 500)
  }, [adultUnlocked])

  const resetAdultLockTimer = useCallback(() => {
    if (adultLockTimer.current) clearTimeout(adultLockTimer.current)
    adultLockTimer.current = setTimeout(() => setAdultUnlocked(false), 8000)
  }, [])

  useEffect(() => {
    if (adultUnlocked) resetAdultLockTimer()
    return () => { if (adultLockTimer.current) clearTimeout(adultLockTimer.current) }
  }, [adultUnlocked, resetAdultLockTimer])

  // ─── Adult task long-press ───
  const [adultPressingId, setAdultPressingId] = useState<string | null>(null)
  const adultTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleAdultPointerDown = useCallback((e: React.PointerEvent, item: TimelineItem) => {
    if (!adultUnlocked) return
    resetAdultLockTimer()
    setAdultPressingId(item.id)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (rect.left + rect.width / 2) / window.innerWidth
    const y = (rect.top + rect.height / 2) / window.innerHeight
    adultTimeoutRef.current = setTimeout(() => {
      setAdultPressingId(null)
      confetti({ particleCount: 80, spread: 60, origin: { x, y }, colors: ['#6DC4A7', '#F9C35C', '#F26E63', '#FFFFFF'] })
      setTimeout(() => onComplete(item), 300)
    }, 700)
  }, [adultUnlocked, onComplete, resetAdultLockTimer])

  const handleAdultPointerCancel = useCallback(() => {
    if (adultTimeoutRef.current) {
      clearTimeout(adultTimeoutRef.current)
      adultTimeoutRef.current = null
    }
    setAdultPressingId(null)
  }, [])

  const incompleteAdultTasks = adultTasks.filter(t => !t.completed)

  const glass = 'bg-white/[0.08] backdrop-blur-md border border-white/[0.1] rounded-[1.25rem]'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with progress */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50">
          Rooms
        </div>
        {totalCount > 0 && (
          <div className="text-[0.8rem] font-bold text-white/30 uppercase tracking-wider">
            {completedCount}/{totalCount} done
          </div>
        )}
      </div>

      {/* All Clear / Empty state */}
      {allClear ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="text-[4rem] block mb-2">🏠✨</span>
            <div className="text-[1.3rem] font-black text-white uppercase tracking-widest">House is Tidy!</div>
            <div className="text-[0.9rem] font-bold text-white/40 mt-1">All {totalCount} tasks complete</div>
          </div>
        </div>
      ) : totalCount === 0 && incompleteAdultTasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="text-[4rem] block mb-2">🏠</span>
            <div className="text-[1.1rem] font-black text-white/40 uppercase tracking-widest">No Room Tasks</div>
            <div className="text-[0.85rem] font-bold text-white/25 mt-1">Add family tasks to see them here</div>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto min-h-0"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Room cards grid */}
          <div className="grid grid-cols-2 gap-3">
            {roomGroups.map(({ room, tasks }) => (
              <div key={room.id} className={`${glass} p-4 flex flex-col`}>
                {/* Room header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[1.4rem]">{room.emoji}</span>
                    <span className="text-[0.85rem] font-black text-white uppercase tracking-wider">
                      {room.name}
                    </span>
                  </div>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-black text-white"
                    style={{ backgroundColor: room.color }}
                  >
                    {tasks.length}
                  </div>
                </div>

                {/* Task list */}
                <div className="flex flex-col gap-1.5">
                  {tasks.map(task => {
                    const isPressing = pressingId === task.id
                    const icon = getEmojiIcon(task.title)
                    return (
                      <div
                        key={task.id}
                        onPointerDown={(e) => handlePointerDown(e, task)}
                        onPointerUp={() => handlePointerUp(task)}
                        onPointerLeave={handlePointerCancel}
                        onPointerCancel={handlePointerCancel}
                        className={`relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-all duration-300 select-none cursor-pointer ${isPressing ? 'bg-white/15 scale-[0.97]' : 'bg-white/[0.04] hover:bg-white/[0.08]'}`}
                        style={{ touchAction: 'none' }}
                      >
                        {/* Hold fill */}
                        <div
                          className={`absolute inset-0 rounded-lg bg-white/10 origin-left pointer-events-none ${isPressing ? 'scale-x-100 duration-700 ease-linear' : 'scale-x-0 duration-150 ease-out'}`}
                          style={{ transition: 'transform' }}
                        />
                        <span className="text-[0.85rem] flex-shrink-0 relative z-10">{icon}</span>
                        <span className="text-[0.8rem] font-bold text-white/80 truncate relative z-10">
                          {task.title}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Adult tasks section */}
          {incompleteAdultTasks.length > 0 && (
            <div className="mt-4">
              {/* Divider */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-white/10" />
                <button
                  onClick={handleLockTap}
                  className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] select-none"
                  style={{ touchAction: 'none' }}
                >
                  <span className="text-[0.75rem] font-black text-white/40 uppercase tracking-widest">
                    Scott & Iris
                  </span>
                  <span className="text-[0.9rem]">
                    {adultUnlocked ? '🔓' : '🔒'}
                  </span>
                </button>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {/* Adult task list */}
              <div className={`flex flex-col gap-1.5 transition-opacity duration-300 ${adultUnlocked ? 'opacity-100' : 'opacity-40'}`}>
                {incompleteAdultTasks.map(task => {
                  const isPressing = adultPressingId === task.id
                  const icon = getEmojiIcon(task.title)
                  return (
                    <div
                      key={task.id}
                      onPointerDown={adultUnlocked ? (e) => handleAdultPointerDown(e, task) : undefined}
                      onPointerUp={handleAdultPointerCancel}
                      onPointerLeave={handleAdultPointerCancel}
                      onPointerCancel={handleAdultPointerCancel}
                      className={`relative flex items-center gap-2 rounded-lg px-3 py-2 transition-all duration-300 select-none ${adultUnlocked ? 'cursor-pointer' : 'cursor-default'} ${isPressing ? 'bg-white/15 scale-[0.97]' : 'bg-white/[0.04]'}`}
                      style={{ touchAction: 'none' }}
                    >
                      {isPressing && (
                        <div
                          className="absolute inset-0 rounded-lg bg-white/10 origin-left scale-x-100 duration-700 ease-linear pointer-events-none"
                          style={{ transition: 'transform' }}
                        />
                      )}
                      <span className="text-[0.85rem] flex-shrink-0 relative z-10">{icon}</span>
                      <span className="text-[0.8rem] font-bold text-white/70 truncate relative z-10">
                        {task.title}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
