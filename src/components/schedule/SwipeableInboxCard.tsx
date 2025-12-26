import { useRef, useState, useCallback, useEffect, type TouchEvent } from 'react'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { ScheduleContextItem } from '@/components/triage'
import { MultiAssigneeDropdown } from '@/components/family'
import { SchedulePopover, DeferPicker, ContextPicker } from '@/components/triage'
import { ArrowRightToLine, Tag, MoreHorizontal } from 'lucide-react'
import { useMobile } from '@/hooks/useMobile'

interface SwipeableInboxCardProps {
  task: Task
  onUpdate: (updates: Partial<Task>) => void
  onSelect: () => void
  onDefer: (date: Date | undefined) => void
  projects?: Project[]
  onOpenProject?: (projectId: string) => void
  familyMembers?: FamilyMember[]
  onAssignTaskAll?: (memberIds: string[]) => void
  getScheduleItemsForDate?: (date: Date) => ScheduleContextItem[]
}

// Swipe thresholds
const COMPLETE_THRESHOLD = 80
const ACTION_THRESHOLD = 60
const RESISTANCE = 0.4

export function SwipeableInboxCard({
  task,
  onUpdate,
  onSelect,
  onDefer,
  projects = [],
  onOpenProject,
  familyMembers = [],
  onAssignTaskAll,
  getScheduleItemsForDate,
}: SwipeableInboxCardProps) {
  const isMobile = useMobile()
  const cardRef = useRef<HTMLDivElement>(null)
  const [translateX, setTranslateX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const isHorizontalSwipe = useRef<boolean | null>(null)

  const project = projects.find(p => p.id === task.projectId)

  // Touch handlers for mobile swipe
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isMobile || showActions) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    isHorizontalSwipe.current = null
    setIsDragging(true)
  }, [isMobile, showActions])

  // Use a ref for the touch move handler to access latest state
  const isDraggingRef = useRef(false)
  useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  // Attach touchmove with { passive: false } to allow preventDefault
  useEffect(() => {
    if (!isMobile) return
    const card = cardRef.current
    if (!card) return

    const handleTouchMove = (e: globalThis.TouchEvent) => {
      if (!isDraggingRef.current) return

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

      // LEFT swipe (negative) - for completion
      if (diffX < -COMPLETE_THRESHOLD) {
        newTranslate = -COMPLETE_THRESHOLD + (diffX + COMPLETE_THRESHOLD) * RESISTANCE
      }
      // RIGHT swipe (positive) - for action buttons
      else if (diffX > ACTION_THRESHOLD * 3) {
        newTranslate = ACTION_THRESHOLD * 3 + (diffX - ACTION_THRESHOLD * 3) * RESISTANCE
      }

      setTranslateX(newTranslate)
    }

    card.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => card.removeEventListener('touchmove', handleTouchMove)
  }, [isMobile])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)

    // LEFT swipe past threshold - complete
    if (translateX < -COMPLETE_THRESHOLD) {
      onUpdate({ completed: !task.completed })
      setTranslateX(0)
    }
    // RIGHT swipe past threshold - show action buttons
    else if (translateX > ACTION_THRESHOLD) {
      setShowActions(true)
      setTranslateX(180) // Width of 3 buttons
    }
    else {
      setTranslateX(0)
    }
  }, [isDragging, translateX, onUpdate, task.completed])

  const closeActions = useCallback(() => {
    setShowActions(false)
    setTranslateX(0)
  }, [])

  // Visual state calculations
  const completeProgress = Math.min(Math.max(-translateX, 0) / COMPLETE_THRESHOLD, 1)
  const showCompleteIndicator = translateX < -20

  // Action handlers - direct actions for mobile swipe
  const handleTomorrowClick = useCallback(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    onUpdate({ scheduledFor: tomorrow, isAllDay: false, deferredUntil: undefined })
    closeActions()
  }, [onUpdate, closeActions])

  const handleContextClick = useCallback(() => {
    // Cycle through contexts: null -> work -> family -> personal -> null
    const contexts: Array<'work' | 'family' | 'personal' | undefined> = ['work', 'family', 'personal', undefined]
    const currentIndex = task.context ? contexts.indexOf(task.context) : -1
    const nextContext = contexts[(currentIndex + 1) % contexts.length]
    onUpdate({ context: nextContext })
    closeActions()
  }, [task.context, onUpdate, closeActions])

  const handleMoreClick = useCallback(() => {
    closeActions()
    onSelect() // Open detail panel for full triage
  }, [closeActions, onSelect])

  return (
    <div className="relative rounded-xl">
      {/* Complete indicator - appears on RIGHT when swiping LEFT (mobile only) */}
      {isMobile && translateX < 0 && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 rounded-r-xl"
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

      {/* Action buttons - appear on LEFT when swiping RIGHT (mobile only) */}
      {isMobile && (translateX > 0 || showActions) && (
        <div className="absolute inset-y-0 left-0 flex items-stretch overflow-hidden rounded-l-xl">
          <button
            onClick={handleTomorrowClick}
            className="w-[60px] flex flex-col items-center justify-center gap-1 bg-blue-500 text-white text-xs font-medium active:bg-blue-600"
          >
            <ArrowRightToLine className="w-5 h-5" />
            <span>Tomorrow</span>
          </button>
          <button
            onClick={handleContextClick}
            className="w-[60px] flex flex-col items-center justify-center gap-1 bg-purple-500 text-white text-xs font-medium active:bg-purple-600"
          >
            <Tag className="w-5 h-5" />
            <span>Context</span>
          </button>
          <button
            onClick={handleMoreClick}
            className="w-[60px] flex flex-col items-center justify-center gap-1 bg-amber-500 text-white text-xs font-medium active:bg-amber-600"
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
        onClick={isMobile && showActions ? closeActions : onSelect}
        className={`
          relative z-10 bg-white rounded-xl border border-neutral-100 px-3 py-2.5 shadow-sm cursor-pointer hover:border-primary-200 hover:shadow-md transition-all group
          ${!isDragging && isMobile ? 'transition-transform duration-200 ease-out' : ''}
        `}
        style={isMobile ? { transform: `translateX(${translateX}px)` } : undefined}
      >
        {/* Main row: checkbox | title | triage icons (desktop) */}
        <div className="flex items-center gap-2">
          {/* Checkbox */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUpdate({ completed: !task.completed })
            }}
            className="shrink-0 touch-target flex items-center justify-center -m-1 p-1"
          >
            <span
              className={`
                w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
                ${task.completed
                  ? 'bg-primary-500 border-primary-500 text-white'
                  : 'border-neutral-300 hover:border-primary-400'
                }
              `}
            >
              {task.completed && (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
          </button>

          {/* Title - takes all available space, allow 2 lines */}
          <span
            className={`flex-1 min-w-0 text-sm leading-snug line-clamp-2 ${
              task.completed ? 'text-neutral-400 line-through' : 'text-neutral-800'
            }`}
          >
            {task.title}
          </span>

          {/* Triage actions: Defer, Schedule, Context, Assign (desktop only) */}
          <div className="hidden md:flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {/* Defer button */}
            <DeferPicker
              deferredUntil={task.deferredUntil}
              deferCount={task.deferCount}
              onDefer={onDefer}
            />

            {/* Schedule button */}
            <SchedulePopover
              value={task.scheduledFor}
              isAllDay={task.isAllDay}
              onSchedule={(date, isAllDay) => {
                onUpdate({ scheduledFor: date, isAllDay, deferredUntil: undefined })
              }}
              onClear={() => onUpdate({ scheduledFor: undefined, isAllDay: undefined })}
              getItemsForDate={getScheduleItemsForDate}
            />

            {/* Context picker */}
            <ContextPicker
              value={task.context}
              onChange={(context) => onUpdate({ context })}
            />

            {/* Multi-assignee avatar */}
            {familyMembers.length > 0 && onAssignTaskAll && (
              <MultiAssigneeDropdown
                members={familyMembers}
                selectedIds={task.assignedToAll || []}
                onSelect={onAssignTaskAll}
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Chips row - desktop only, only show if project exists */}
        {project && (
          <div className="hidden md:flex items-center gap-2 mt-1.5 ml-8 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs max-w-[140px]">
              <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              {onOpenProject ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenProject(project.id)
                  }}
                  className="truncate hover:underline"
                >
                  {project.name}
                </button>
              ) : (
                <span className="truncate">{project.name}</span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUpdate({ projectId: undefined })
                }}
                className="ml-0.5 hover:text-blue-900 shrink-0"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
