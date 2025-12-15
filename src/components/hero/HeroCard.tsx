import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { Project } from '@/types/project'
import type { Contact } from '@/types/contact'
import { getTimeOfDay } from '@/lib/timeUtils'
import { Folder, User, MapPin, Repeat } from 'lucide-react'

interface HeroCardProps {
  task: TimelineItem
  project: Project | null
  contact: Contact | null
  exitAnimation: 'complete' | 'defer' | 'skip' | null
  enterDirection: 'up' | 'right'
  onSwipeComplete: () => void
  onSwipeDefer: () => void
  onSwipeExit: () => void
}

// Swipe thresholds
const SWIPE_THRESHOLD = 100
const EXIT_DOWN_THRESHOLD = 80

/**
 * HeroCard - The beautiful task card
 *
 * Displays a single task with gorgeous typography, metadata,
 * and swipe gesture support.
 */
export function HeroCard({
  task,
  project,
  contact,
  exitAnimation,
  enterDirection,
  onSwipeComplete,
  onSwipeDefer,
  onSwipeExit,
}: HeroCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragDirection, setDragDirection] = useState<'horizontal' | 'vertical' | null>(null)

  // Touch tracking
  const startPos = useRef({ x: 0, y: 0 })
  const currentPos = useRef({ x: 0, y: 0 })

  // Format time display
  const timeDisplay = useMemo(() => {
    if (task.allDay) return 'All day'
    if (!task.startTime) return null

    const hours = task.startTime.getHours()
    const minutes = task.startTime.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    const displayMinutes = minutes.toString().padStart(2, '0')

    return `${displayHours}:${displayMinutes} ${ampm}`
  }, [task.startTime, task.allDay])

  // Get time section label
  const sectionLabel = useMemo(() => {
    if (task.allDay) return 'ALL DAY'
    if (!task.startTime) return 'ANYTIME'
    const section = getTimeOfDay(task.startTime)
    return section.toUpperCase()
  }, [task.startTime, task.allDay])

  // Get animation class
  const animationClass = useMemo(() => {
    if (exitAnimation === 'complete') return 'hero-card-complete'
    if (exitAnimation === 'defer') return 'hero-card-defer'
    if (exitAnimation === 'skip') return 'hero-card-skip'
    if (enterDirection === 'right') return 'hero-card-enter-right'
    return 'hero-card-enter'
  }, [exitAnimation, enterDirection])

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    startPos.current = { x: touch.clientX, y: touch.clientY }
    currentPos.current = { x: touch.clientX, y: touch.clientY }
    setIsDragging(true)
    setDragDirection(null)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return

    const touch = e.touches[0]
    currentPos.current = { x: touch.clientX, y: touch.clientY }

    const deltaX = touch.clientX - startPos.current.x
    const deltaY = touch.clientY - startPos.current.y

    // Determine direction on first significant movement
    if (!dragDirection) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          setDragDirection('horizontal')
        } else {
          setDragDirection('vertical')
        }
      }
    }

    // Apply appropriate offset based on direction
    if (dragDirection === 'horizontal') {
      setDragOffset({ x: deltaX * 0.8, y: 0 })
      e.preventDefault()
    } else if (dragDirection === 'vertical' && deltaY > 0) {
      // Only allow downward drag for exit
      setDragOffset({ x: 0, y: deltaY * 0.6 })
      e.preventDefault()
    }
  }, [isDragging, dragDirection])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return

    const deltaX = currentPos.current.x - startPos.current.x
    const deltaY = currentPos.current.y - startPos.current.y

    // Check for swipe actions
    if (dragDirection === 'horizontal') {
      if (deltaX > SWIPE_THRESHOLD) {
        // Swipe right - complete
        onSwipeComplete()
      } else if (deltaX < -SWIPE_THRESHOLD) {
        // Swipe left - defer
        onSwipeDefer()
      }
    } else if (dragDirection === 'vertical' && deltaY > EXIT_DOWN_THRESHOLD) {
      // Swipe down - exit
      onSwipeExit()
    }

    // Reset state
    setIsDragging(false)
    setDragOffset({ x: 0, y: 0 })
    setDragDirection(null)
  }, [isDragging, dragDirection, onSwipeComplete, onSwipeDefer, onSwipeExit])

  // Cancel drag on touch cancel
  const handleTouchCancel = useCallback(() => {
    setIsDragging(false)
    setDragOffset({ x: 0, y: 0 })
    setDragDirection(null)
  }, [])

  // Haptic feedback on threshold
  useEffect(() => {
    if (!isDragging) return

    const absX = Math.abs(dragOffset.x)
    const absY = dragOffset.y

    if (
      (absX > SWIPE_THRESHOLD * 0.9 && absX < SWIPE_THRESHOLD * 1.1) ||
      (absY > EXIT_DOWN_THRESHOLD * 0.9 && absY < EXIT_DOWN_THRESHOLD * 1.1)
    ) {
      if (navigator.vibrate) {
        navigator.vibrate(10)
      }
    }
  }, [isDragging, dragOffset])

  // Calculate card transform
  const cardStyle = useMemo(() => {
    if (!isDragging) return {}

    const rotation = dragOffset.x * 0.02
    const scale = 1 - Math.abs(dragOffset.x) * 0.0002

    return {
      transform: `translateX(${dragOffset.x}px) translateY(${dragOffset.y}px) rotate(${rotation}deg) scale(${scale})`,
      transition: 'none',
    }
  }, [isDragging, dragOffset])

  // Swipe indicator opacity
  const swipeRightOpacity = useMemo(() => {
    if (dragDirection !== 'horizontal' || dragOffset.x <= 0) return 0
    return Math.min(dragOffset.x / SWIPE_THRESHOLD, 1)
  }, [dragDirection, dragOffset.x])

  const swipeLeftOpacity = useMemo(() => {
    if (dragDirection !== 'horizontal' || dragOffset.x >= 0) return 0
    return Math.min(Math.abs(dragOffset.x) / SWIPE_THRESHOLD, 1)
  }, [dragDirection, dragOffset.x])

  return (
    <div className="relative w-full max-w-md">
      {/* Swipe feedback zones */}
      <div
        className="absolute inset-0 rounded-3xl hero-swipe-complete-zone pointer-events-none transition-opacity duration-150"
        style={{ opacity: swipeRightOpacity * 0.8 }}
      />
      <div
        className="absolute inset-0 rounded-3xl hero-swipe-defer-zone pointer-events-none transition-opacity duration-150"
        style={{ opacity: swipeLeftOpacity * 0.8 }}
      />

      {/* The Card */}
      <div
        ref={cardRef}
        className={`
          relative bg-bg-elevated rounded-3xl p-8 sm:p-10
          ${isDragging ? 'hero-card-dragging' : 'hero-card-shadow'}
          ${!isDragging && !exitAnimation ? 'hero-card-breathe' : ''}
          ${animationClass}
        `}
        style={cardStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* Decorative top line */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-neutral-200 rounded-full opacity-50" />

        {/* Time badge */}
        {timeDisplay && (
          <div className="text-center mb-6 pt-4">
            <div className="inline-flex flex-col items-center">
              <span className="text-xl font-medium text-primary-600 tracking-wide">
                {timeDisplay}
              </span>
              <span className="text-xs font-medium text-neutral-400 tracking-widest mt-1">
                {sectionLabel}
              </span>
            </div>
          </div>
        )}

        {/* Task title - the hero */}
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl sm:text-4xl text-neutral-800 leading-tight">
            {task.title}
          </h1>
        </div>

        {/* Decorative divider */}
        <div className="flex justify-center mb-6">
          <div className="w-12 h-px bg-neutral-200" />
        </div>

        {/* Metadata */}
        <div className="space-y-3">
          {/* Project */}
          {project && (
            <div className="flex items-center justify-center gap-2 text-neutral-500">
              <Folder className="w-4 h-4" />
              <span className="text-sm font-medium">{project.name}</span>
            </div>
          )}

          {/* Contact */}
          {contact && (
            <div className="flex items-center justify-center gap-2 text-neutral-500">
              <User className="w-4 h-4" />
              <span className="text-sm font-medium">{contact.name}</span>
            </div>
          )}

          {/* Location */}
          {task.location && (
            <div className="flex items-center justify-center gap-2 text-neutral-500">
              <MapPin className="w-4 h-4" />
              <span className="text-sm font-medium truncate max-w-[200px]">{task.location}</span>
            </div>
          )}

          {/* Routine indicator */}
          {task.type === 'routine' && (
            <div className="flex items-center justify-center gap-2 text-neutral-400">
              <Repeat className="w-4 h-4" />
              <span className="text-xs font-medium">Recurring</span>
            </div>
          )}
        </div>

        {/* Notes preview (if short) */}
        {task.notes && task.notes.length < 100 && (
          <div className="mt-6 pt-4 border-t border-neutral-100">
            <p className="text-sm text-neutral-500 text-center italic">
              "{task.notes}"
            </p>
          </div>
        )}

        {/* Swipe hints */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-between px-4 pointer-events-none">
          <span
            className="text-xs text-neutral-300 transition-opacity"
            style={{ opacity: isDragging && dragDirection === 'horizontal' ? 0.6 : 0 }}
          >
            ← Later
          </span>
          <span
            className="text-xs text-neutral-300 transition-opacity"
            style={{ opacity: isDragging && dragDirection === 'horizontal' ? 0.6 : 0 }}
          >
            Done →
          </span>
        </div>
      </div>
    </div>
  )
}

export default HeroCard
