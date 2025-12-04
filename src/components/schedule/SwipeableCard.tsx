import { useRef, useState, useCallback, useMemo, type TouchEvent } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import { formatTime } from '@/lib/timeUtils'
import { AssigneeDropdown } from '@/components/family'

interface SwipeableCardProps {
  item: TimelineItem
  selected?: boolean
  onSelect: () => void
  onComplete: () => void
  onDefer?: (date: Date) => void
  onSkip?: () => void
  // Family member assignment
  familyMembers?: FamilyMember[]
  assignedTo?: string | null
  onAssign?: (memberId: string | null) => void
}

// Swipe thresholds
const COMPLETE_THRESHOLD = 80
const ACTION_THRESHOLD = 60
const RESISTANCE = 0.4

export function SwipeableCard({
  item,
  selected,
  onSelect,
  onComplete,
  onDefer,
  onSkip,
  familyMembers = [],
  assignedTo,
  onAssign,
}: SwipeableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [translateX, setTranslateX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const isHorizontalSwipe = useRef<boolean | null>(null)

  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isActionable = isTask || isRoutine

  // Memoize time display to prevent recalculation
  const timeText = useMemo(() => {
    if (item.allDay) return 'All day'
    if (!item.startTime) return null
    return formatTime(item.startTime)
  }, [item.allDay, item.startTime])

  // Touch handlers - stable references
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (showActions) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isHorizontalSwipe.current = null
    setIsDragging(true)
  }, [showActions])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const diffX = currentX - startX.current
    const diffY = currentY - startY.current

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY)
      }
    }

    if (!isHorizontalSwipe.current) return

    e.preventDefault()

    let newTranslate = diffX
    if (diffX > COMPLETE_THRESHOLD) {
      newTranslate = COMPLETE_THRESHOLD + (diffX - COMPLETE_THRESHOLD) * RESISTANCE
    } else if (diffX < -ACTION_THRESHOLD * 2) {
      newTranslate = -ACTION_THRESHOLD * 2 + (diffX + ACTION_THRESHOLD * 2) * RESISTANCE
    }

    setTranslateX(newTranslate)
  }, [isDragging])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)

    if (translateX > COMPLETE_THRESHOLD && isActionable) {
      onComplete()
      setTranslateX(0)
    } else if (translateX < -ACTION_THRESHOLD) {
      setShowActions(true)
      setTranslateX(-140)
    } else {
      setTranslateX(0)
    }
  }, [isDragging, translateX, isActionable, onComplete])

  const closeActions = useCallback(() => {
    setShowActions(false)
    setTranslateX(0)
  }, [])

  const handleAction = useCallback((action: 'tomorrow' | 'skip' | 'nextWeek') => {
    if (action === 'tomorrow' && onDefer) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      onDefer(tomorrow)
    } else if (action === 'nextWeek' && onDefer) {
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      nextWeek.setHours(9, 0, 0, 0)
      onDefer(nextWeek)
    } else if (action === 'skip' && onSkip) {
      onSkip()
    }
    closeActions()
  }, [onDefer, onSkip, closeActions])

  // Visual state calculations
  const completeProgress = Math.min(Math.max(translateX, 0) / COMPLETE_THRESHOLD, 1)
  const showCompleteIndicator = translateX > 20 && isActionable

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Complete indicator (green background on right swipe) */}
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-start pl-4"
        style={{
          width: Math.max(translateX, 0),
          backgroundColor: completeProgress > 0.8
            ? 'hsl(152 50% 32%)'
            : `hsl(152 50% ${32 + (1 - completeProgress) * 30}%)`,
        }}
      >
        {showCompleteIndicator && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6 text-white"
            style={{
              transform: `scale(${0.5 + completeProgress * 0.5})`,
              opacity: completeProgress,
            }}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {/* Action buttons (revealed on left swipe) */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          onClick={() => handleAction('tomorrow')}
          className="w-[70px] flex flex-col items-center justify-center gap-1 bg-amber-500 text-white text-xs font-medium active:bg-amber-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          <span>Tomorrow</span>
        </button>
        <button
          onClick={() => handleAction('skip')}
          className="w-[70px] flex flex-col items-center justify-center gap-1 bg-neutral-500 text-white text-xs font-medium active:bg-neutral-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>Skip</span>
        </button>
      </div>

      {/* Main card content */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={showActions ? closeActions : onSelect}
        className={`
          relative z-10 px-3 py-2.5 bg-bg-elevated border cursor-pointer
          ${!isDragging ? 'transition-transform duration-200 ease-out' : ''}
          ${selected
            ? 'border-primary-200 shadow-md ring-1 ring-primary-200'
            : 'border-neutral-100'
          }
          ${item.completed ? 'opacity-60' : ''}
        `}
        style={{ transform: `translateX(${translateX}px)` }}
      >
        <div className="flex items-center gap-3">
          {/* Time - compact, LEFT side like desktop */}
          <div className="w-10 shrink-0 text-xs text-neutral-400 font-medium tabular-nums">
            {timeText || '—'}
          </div>

          {/* Checkbox/Event indicator - fixed width for alignment */}
          <div className="w-5 shrink-0 flex items-center justify-center">
            {isActionable ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onComplete()
                }}
                className="touch-manipulation"
                aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                <span
                  className={`
                    flex items-center justify-center w-5 h-5 rounded-md border-2 transition-colors
                    ${isRoutine ? 'rounded-full' : ''}
                    ${item.completed
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'border-neutral-300'
                    }
                  `}
                >
                  {item.completed && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
              </button>
            ) : (
              <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
            )}
          </div>

          {/* Title */}
          <span
            className={`
              flex-1 min-w-0 text-base font-medium leading-snug truncate
              ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
            `}
          >
            {item.title}
          </span>

          {/* Assignee avatar */}
          {familyMembers.length > 0 && onAssign && (
            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <AssigneeDropdown
                members={familyMembers}
                selectedId={assignedTo}
                onSelect={onAssign}
                size="sm"
              />
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
