import { useRef, useState, useCallback, useMemo, useEffect, type TouchEvent } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import { formatTime } from '@/lib/timeUtils'
import { getProjectColor } from '@/lib/projectUtils'
import { TypeIcon } from './TypeIcon'
import { AssigneeDropdown } from '@/components/family'
import { ArrowRightToLine, Redo2, MoreHorizontal, Check } from 'lucide-react'

interface SwipeableCardProps {
  item: TimelineItem
  selected?: boolean
  onSelect: () => void
  onComplete: () => void
  onDefer?: (date: Date) => void
  onSkip?: () => void
  onOpenDetail?: () => void
  familyMembers?: FamilyMember[]
  assignedTo?: string | null
  onAssign?: (memberId: string | null) => void
  // Bulk selection mode
  selectionMode?: boolean
  multiSelected?: boolean
  onLongPress?: () => void
  onToggleSelect?: () => void
}

// Swipe thresholds
const COMPLETE_THRESHOLD = 80
const ACTION_THRESHOLD = 60
const RESISTANCE = 0.4
// Dead zone - must move this far before any card movement
const DEAD_ZONE = 20

// Long press delay
const LONG_PRESS_DELAY = 500

export function SwipeableCard({
  item,
  selected,
  onComplete,
  onDefer,
  onSkip,
  onOpenDetail,
  familyMembers = [],
  assignedTo,
  onAssign,
  selectionMode,
  multiSelected,
  onLongPress,
  onToggleSelect,
}: SwipeableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [translateX, setTranslateX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const isHorizontalSwipe = useRef<boolean | null>(null)

  // Long press state
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const longPressTriggered = useRef(false)

  const isTask = item.type === 'task'
  const isRoutine = item.type === 'routine'
  const isEvent = item.type === 'event'
  const isActionable = isTask || isRoutine || isEvent

  // Memoize time display
  const timeText = useMemo(() => {
    if (item.allDay) return 'All day'
    if (!item.startTime) return null
    return formatTime(item.startTime)
  }, [item.allDay, item.startTime])

  // Get assigned family member
  const assignedMember = useMemo(() => {
    if (!assignedTo || familyMembers.length === 0) return undefined
    return familyMembers.find(m => m.id === assignedTo)
  }, [assignedTo, familyMembers])
  void assignedMember // Will be used for avatar display

  // Get project color for left edge indicator
  const projectColor = item.projectId ? getProjectColor(item.projectId) : null

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // Touch handlers
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (showActions) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isHorizontalSwipe.current = null
    longPressTriggered.current = false

    // In selection mode, don't enable swipe - just handle taps
    if (selectionMode) {
      return
    }

    setIsDragging(true)

    // Start long press timer for tasks
    if (isTask && onLongPress) {
      longPressTimer.current = setTimeout(() => {
        longPressTriggered.current = true
        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(50)
        }
        onLongPress()
        setIsDragging(false)
      }, LONG_PRESS_DELAY)
    }
  }, [showActions, selectionMode, isTask, onLongPress])

  // Use a ref for the touch move handler to access latest state
  const isDraggingRef = useRef(false)
  useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  // Attach touchmove with { passive: false } to allow preventDefault
  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const handleTouchMove = (e: globalThis.TouchEvent) => {
      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      const diffX = currentX - startX.current
      const diffY = currentY - startY.current
      const absDiffX = Math.abs(diffX)
      const absDiffY = Math.abs(diffY)

      // Cancel long press on any movement beyond a small threshold
      if (longPressTimer.current && (absDiffX > 8 || absDiffY > 8)) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }

      if (!isDraggingRef.current) return

      // Determine swipe direction on first significant movement
      // Require clear horizontal intent (1.5x more horizontal than vertical)
      if (isHorizontalSwipe.current === null) {
        if (absDiffX > DEAD_ZONE || absDiffY > DEAD_ZONE) {
          isHorizontalSwipe.current = absDiffX > absDiffY * 1.5
        }
      }

      // If not a horizontal swipe (or not yet determined), don't move the card
      if (!isHorizontalSwipe.current) return

      e.preventDefault()

      // Calculate translation, subtracting the dead zone so there's no initial jump
      const effectiveDiff = diffX > 0
        ? Math.max(0, diffX - DEAD_ZONE)
        : Math.min(0, diffX + DEAD_ZONE)

      let newTranslate = effectiveDiff

      // LEFT swipe (negative) - for completion - apply resistance past threshold
      if (effectiveDiff < -COMPLETE_THRESHOLD) {
        newTranslate = -COMPLETE_THRESHOLD + (effectiveDiff + COMPLETE_THRESHOLD) * RESISTANCE
      }
      // RIGHT swipe (positive) - for action buttons - apply resistance past threshold
      else if (effectiveDiff > ACTION_THRESHOLD * 2) {
        newTranslate = ACTION_THRESHOLD * 2 + (effectiveDiff - ACTION_THRESHOLD * 2) * RESISTANCE
      }

      setTranslateX(newTranslate)
    }

    card.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => card.removeEventListener('touchmove', handleTouchMove)
  }, [])

  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer()

    // In selection mode, handle tap to toggle selection
    if (selectionMode && isTask && onToggleSelect && !longPressTriggered.current) {
      onToggleSelect()
      return
    }

    // If long press was triggered, don't do anything else
    if (longPressTriggered.current) {
      return
    }

    if (!isDragging) return
    setIsDragging(false)

    // LEFT swipe past threshold - complete (only for actionable items)
    // Use a slightly lower threshold (60) since we already subtracted the dead zone
    if (translateX < -60 && isActionable) {
      onComplete()
      setTranslateX(0)
    }
    // RIGHT swipe past threshold - show action buttons
    else if (translateX > 40) {
      setShowActions(true)
      setTranslateX(180) // Width of 3 buttons
    }
    else {
      setTranslateX(0)
    }
  }, [isDragging, translateX, isActionable, onComplete, clearLongPressTimer, selectionMode, isTask, onToggleSelect])

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => clearLongPressTimer()
  }, [clearLongPressTimer])

  const closeActions = useCallback(() => {
    setShowActions(false)
    setTranslateX(0)
  }, [])

  const handleAction = useCallback((action: 'tomorrow' | 'skip' | 'more') => {
    if (action === 'tomorrow' && onDefer) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)
      onDefer(tomorrow)
    } else if (action === 'skip' && onSkip) {
      onSkip()
    } else if (action === 'more' && onOpenDetail) {
      onOpenDetail()
    }
    closeActions()
  }, [onDefer, onSkip, onOpenDetail, closeActions])

  // Visual state calculations
  // For LEFT swipe (negative translateX), show completion indicator on RIGHT
  const completeProgress = Math.min(Math.max(-translateX, 0) / COMPLETE_THRESHOLD, 1)
  const showCompleteIndicator = translateX < -20 && isActionable

  return (
    <div className="relative md:rounded-2xl -mx-3 md:mx-0">
      {/* Selection checkbox overlay - shown in selection mode for tasks */}
      {selectionMode && isTask && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20">
          <div
            className={`
              w-6 h-6 rounded-full border-2 flex items-center justify-center
              transition-all duration-150
              ${multiSelected
                ? 'bg-primary-500 border-primary-500 text-white'
                : 'border-neutral-300 bg-white'
              }
            `}
          >
            {multiSelected && <Check className="w-4 h-4" />}
          </div>
        </div>
      )}

      {/* Complete indicator - appears on RIGHT when swiping LEFT */}
      {translateX < 0 && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 md:rounded-r-2xl"
          style={{
            width: Math.max(-translateX, 0),
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
      )}

      {/* Action buttons - appear on LEFT when swiping RIGHT */}
      {(translateX > 0 || showActions) && (
      <div className="absolute inset-y-0 left-0 flex items-stretch overflow-hidden md:rounded-l-2xl">
        <button
          onClick={() => handleAction('tomorrow')}
          className="w-[60px] flex flex-col items-center justify-center gap-1 bg-amber-500 text-white text-xs font-medium active:bg-amber-600"
        >
          <ArrowRightToLine className="w-5 h-5" />
          <span>Push</span>
        </button>
        <button
          onClick={() => handleAction('skip')}
          className="w-[60px] flex flex-col items-center justify-center gap-1 bg-neutral-500 text-white text-xs font-medium active:bg-neutral-600"
        >
          <Redo2 className="w-5 h-5" />
          <span>Skip</span>
        </button>
        <button
          onClick={() => handleAction('more')}
          className="w-[60px] flex flex-col items-center justify-center gap-1 bg-blue-500 text-white text-xs font-medium active:bg-blue-600"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>More</span>
        </button>
      </div>
      )}

      {/* Main card content */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={showActions ? closeActions : undefined}
        className={`
          relative z-10 py-4 bg-bg-elevated border-y md:border md:rounded-2xl touch-pan-y
          ${selectionMode && isTask ? 'pl-14 pr-4' : 'px-4'}
          ${!isDragging ? 'transition-transform duration-200 ease-out' : ''}
          ${selected
            ? 'border-primary-200 shadow-md ring-1 ring-primary-200'
            : 'border-neutral-100'
          }
          ${multiSelected
            ? 'ring-2 ring-primary-400 bg-primary-50/50'
            : ''
          }
          ${item.completed ? 'opacity-60' : ''}
        `}
        style={{ transform: `translateX(${translateX}px)`, touchAction: 'pan-y' }}
      >
        {/* Project color indicator - left edge */}
        {projectColor && (
          <div
            className="absolute left-0 top-[20%] w-[3px] h-[60%] rounded-none"
            style={{ backgroundColor: projectColor }}
          />
        )}

        <div className="flex items-center gap-4">
          {/* Time - compact, left side */}
          <div className="w-12 shrink-0 text-sm text-neutral-400 font-medium tabular-nums">
            {timeText || '—'}
          </div>

          {/* Type icon - non-interactive indicator */}
          <div className="w-6 shrink-0 flex items-center justify-center">
            <TypeIcon type={item.type} completed={item.completed} />
          </div>

          {/* Title and category */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span
              className={`
                text-lg font-medium leading-snug truncate
                ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
              `}
            >
              {item.title}
            </span>
            {/* Category emoji only on mobile for space */}
            {item.category && item.category !== 'task' && (
              <span className="shrink-0 text-base">
                {item.category === 'errand' && '🚗'}
                {item.category === 'chore' && '🧹'}
                {item.category === 'event' && '📅'}
                {item.category === 'activity' && '⚽'}
              </span>
            )}
          </div>

          {/* Assignee avatar */}
          {familyMembers.length > 0 && (
            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => {
                e.stopPropagation()
                // Prevent card from starting drag
                setIsDragging(false)
              }}
              onTouchEnd={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <AssigneeDropdown
                members={familyMembers}
                selectedId={assignedTo}
                onSelect={onAssign || (() => {})}
                size="sm"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
