import { useState, useMemo, useRef } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import { formatTime, formatTimeRange } from '@/lib/timeUtils'
import { detectActions, type DetectedAction } from '@/lib/actionDetection'

// Swipe configuration
const SWIPE_THRESHOLD = 80 // Minimum distance to trigger action
const SWIPE_MAX = 120 // Max visual offset

interface ExecutionCardProps {
  item: TimelineItem
  onToggleComplete?: (taskId: string) => void
  onDelete?: (taskId: string) => void
  onUpdate?: (taskId: string, updates: Partial<Task>) => void
}

// Icon component for action buttons
function ActionIcon({ type }: { type: DetectedAction['icon'] }) {
  switch (type) {
    case 'recipe':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M6 3a1 1 0 011-1h.01a1 1 0 010 2H7a1 1 0 01-1-1zm2 3a1 1 0 00-2 0v1a2 2 0 00-2 2v1a2 2 0 00-2 2v.683a3.7 3.7 0 011.055.485 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0A3.7 3.7 0 0118 12.683V12a2 2 0 00-2-2V9a2 2 0 00-2-2V6a1 1 0 10-2 0v1h-1V6a1 1 0 10-2 0v1H8V6zm10 8.868a3.704 3.704 0 01-4.055-.036 1.704 1.704 0 00-1.89 0 3.704 3.704 0 01-4.11 0 1.704 1.704 0 00-1.89 0A3.704 3.704 0 012 14.868V17a1 1 0 001 1h14a1 1 0 001-1v-2.132zM9 3a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm3 0a1 1 0 011-1h.01a1 1 0 110 2H13a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      )
    case 'video':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
        </svg>
      )
    case 'map':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
      )
    case 'phone':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
      )
    case 'message':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
      )
    case 'link':
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
        </svg>
      )
  }
}

export function ExecutionCard({ item, onToggleComplete, onDelete, onUpdate }: ExecutionCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [newLink, setNewLink] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(item.title)

  // Swipe gesture state
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const isHorizontalSwipe = useRef<boolean | null>(null)

  // Detect contextual actions from item content
  const detectedActions = useMemo(() => {
    return detectActions(item.title, item.notes, item.location, item.phoneNumber)
  }, [item.title, item.notes, item.location, item.phoneNumber])

  // Get only the primary actions (video call, recipe, directions) - not phone/text/generic links
  const primaryActions = useMemo(() => {
    return detectedActions.filter(
      (action) => action.type === 'video-call' || action.type === 'recipe' || action.type === 'directions'
    )
  }, [detectedActions])

  const isTask = item.type === 'task'
  const hasContext = item.notes || item.phoneNumber || (item.links && item.links.length > 0) || item.location

  const handleCall = () => {
    if (item.phoneNumber) {
      window.location.href = `tel:${item.phoneNumber}`
    }
  }

  const handleText = () => {
    if (item.phoneNumber) {
      window.location.href = `sms:${item.phoneNumber}`
    }
  }

  const handleToggle = () => {
    if (isTask && item.originalTask && onToggleComplete) {
      onToggleComplete(item.originalTask.id)
    }
  }

  const handleDelete = () => {
    if (isTask && item.originalTask && onDelete) {
      onDelete(item.originalTask.id)
    }
  }

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { notes: e.target.value || undefined })
    }
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { phoneNumber: e.target.value || undefined })
    }
  }

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newLink.trim()
    if (!trimmed || !isTask || !item.originalTask || !onUpdate) return

    const currentLinks = item.links || []
    if (!currentLinks.includes(trimmed)) {
      onUpdate(item.originalTask.id, { links: [...currentLinks, trimmed] })
    }
    setNewLink('')
  }

  const handleRemoveLink = (linkToRemove: string) => {
    if (!isTask || !item.originalTask || !onUpdate) return
    const currentLinks = item.links || []
    const newLinks = currentLinks.filter((link) => link !== linkToRemove)
    onUpdate(item.originalTask.id, { links: newLinks.length > 0 ? newLinks : undefined })
  }

  const handleScheduleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isTask || !item.originalTask || !onUpdate) return
    const value = e.target.value
    if (value) {
      onUpdate(item.originalTask.id, { scheduledFor: new Date(value) })
    } else {
      onUpdate(item.originalTask.id, { scheduledFor: undefined })
    }
  }

  const handleClearSchedule = () => {
    if (!isTask || !item.originalTask || !onUpdate) return
    onUpdate(item.originalTask.id, { scheduledFor: undefined })
  }

  const handleTitleClick = () => {
    if (isTask && onUpdate) {
      setEditedTitle(item.title)
      setIsEditingTitle(true)
    }
  }

  const handleTitleSave = () => {
    const trimmed = editedTitle.trim()
    if (trimmed && trimmed !== item.title && isTask && item.originalTask && onUpdate) {
      onUpdate(item.originalTask.id, { title: trimmed })
    }
    setIsEditingTitle(false)
  }

  const handleTitleCancel = () => {
    setEditedTitle(item.title)
    setIsEditingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSave()
    } else if (e.key === 'Escape') {
      handleTitleCancel()
    }
  }

  // Format scheduledFor for datetime-local input (YYYY-MM-DDTHH:mm)
  const getScheduledForInputValue = (): string => {
    if (!item.originalTask?.scheduledFor) return ''
    const date = item.originalTask.scheduledFor
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // Swipe gesture handlers (only for tasks)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isTask || isEditing) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isHorizontalSwipe.current = null
    setIsSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isTask || !isSwiping || touchStartX.current === null || touchStartY.current === null) return

    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = e.touches[0].clientY - touchStartY.current

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY)
      }
    }

    // Only handle horizontal swipes
    if (isHorizontalSwipe.current) {
      e.preventDefault() // Prevent scroll
      // Clamp the offset
      const offset = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, deltaX))
      setSwipeOffset(offset)
    }
  }

  const handleTouchEnd = () => {
    if (!isTask || !isSwiping) return

    // Check if swipe exceeded threshold
    if (swipeOffset > SWIPE_THRESHOLD) {
      // Swipe right = complete
      if (item.originalTask && onToggleComplete) {
        onToggleComplete(item.originalTask.id)
      }
    } else if (swipeOffset < -SWIPE_THRESHOLD) {
      // Swipe left = defer to tomorrow
      if (item.originalTask && onUpdate) {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(9, 0, 0, 0) // Default to 9am tomorrow
        onUpdate(item.originalTask.id, { scheduledFor: tomorrow })
      }
    }

    // Reset swipe state
    setSwipeOffset(0)
    setIsSwiping(false)
    touchStartX.current = null
    touchStartY.current = null
    isHorizontalSwipe.current = null
  }

  // Calculate swipe visual feedback
  const swipeProgress = Math.abs(swipeOffset) / SWIPE_THRESHOLD
  const swipeDirection = swipeOffset > 0 ? 'right' : swipeOffset < 0 ? 'left' : null

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe action indicators (behind the card) */}
      {isTask && isSwiping && (
        <>
          {/* Complete indicator (right swipe) */}
          <div
            className={`absolute inset-y-0 left-0 flex items-center justify-start pl-4
                        transition-colors ${swipeDirection === 'right' && swipeProgress >= 1 ? 'bg-primary-500' : 'bg-primary-100'}`}
            style={{ width: Math.max(0, swipeOffset) }}
          >
            {swipeOffset > 20 && (
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${swipeProgress >= 1 ? 'text-white' : 'text-primary-500'}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          {/* Defer indicator (left swipe) */}
          <div
            className={`absolute inset-y-0 right-0 flex items-center justify-end pr-4
                        transition-colors ${swipeDirection === 'left' && swipeProgress >= 1 ? 'bg-amber-500' : 'bg-amber-100'}`}
            style={{ width: Math.max(0, -swipeOffset) }}
          >
            {swipeOffset < -20 && (
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${swipeProgress >= 1 ? 'text-white' : 'text-amber-500'}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </>
      )}

      {/* Card content */}
      <div
        className={`
          card p-5 animate-fade-in relative
          ${item.completed ? 'opacity-60' : ''}
          ${isSwiping ? 'transition-none' : 'transition-transform'}
        `}
        style={{
          transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
      {/* Header: Type indicator + Time */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            isTask ? 'bg-primary-500' : 'bg-blue-500'
          }`}
        />
        {item.startTime && (
          <span className="text-sm text-neutral-500 font-medium">
            {item.endTime
              ? formatTimeRange(item.startTime, item.endTime, item.allDay)
              : formatTime(item.startTime)}
          </span>
        )}
        {!item.startTime && isTask && (
          <span className="text-sm text-neutral-400">Unscheduled</span>
        )}
      </div>

      {/* Title row with checkbox for tasks */}
      <div className="flex items-start gap-4">
        {isTask && (
          <label className="touch-target flex items-center justify-center cursor-pointer -ml-2 -mt-1">
            <input
              type="checkbox"
              checked={item.completed}
              onChange={handleToggle}
              className="w-6 h-6 rounded-lg border-2 border-neutral-300 text-primary-500
                         focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                         checked:bg-primary-500 checked:border-primary-500
                         transition-colors cursor-pointer"
            />
          </label>
        )}
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              autoFocus
              className="w-full text-lg leading-snug text-neutral-800 bg-transparent
                         border-b-2 border-primary-500 outline-none
                         -mb-0.5 py-0"
              aria-label="Edit task title"
            />
          ) : (
            <h3
              onClick={handleTitleClick}
              className={`text-lg leading-snug ${
                item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'
              } ${isTask && onUpdate ? 'cursor-text hover:text-primary-600' : ''}`}
              role={isTask && onUpdate ? 'button' : undefined}
              tabIndex={isTask && onUpdate ? 0 : undefined}
              onKeyDown={(e) => {
                if (isTask && onUpdate && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  handleTitleClick()
                }
              }}
            >
              {item.title}
            </h3>
          )}

          {/* Location for events */}
          {item.location && (
            <p className="text-sm text-neutral-500 mt-2 flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span className="truncate">{item.location}</span>
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 -mr-2">
          {/* Edit button for tasks */}
          {isTask && onUpdate && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`touch-target flex items-center justify-center rounded-lg transition-colors
                ${isEditing
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
                }`}
              aria-label={isEditing ? 'Close edit' : 'Edit task'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
          )}

          {/* Delete button for tasks */}
          {isTask && onDelete && (
            <button
              onClick={handleDelete}
              className="touch-target flex items-center justify-center rounded-lg
                         text-neutral-400 hover:text-danger-500 hover:bg-danger-50 transition-colors"
              aria-label="Delete task"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Primary contextual actions (Join Call, Get Directions, View Recipe) */}
      {primaryActions.length > 0 && !isEditing && (
        <div className="mt-4 flex flex-wrap gap-2">
          {primaryActions.map((action, index) => (
            <button
              key={`${action.type}-${index}`}
              onClick={() => {
                if (action.url) {
                  window.open(action.url, '_blank', 'noopener,noreferrer')
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5
                         text-sm font-medium bg-primary-500 text-white
                         rounded-lg hover:bg-primary-600 transition-colors"
            >
              <ActionIcon type={action.icon} />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Context display section (read-only) */}
      {hasContext && !isEditing && (
        <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
          {/* Notes */}
          {item.notes && (
            <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">{item.notes}</p>
          )}

          {/* Phone with call and text buttons */}
          {item.phoneNumber && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCall}
                className="touch-target inline-flex items-center gap-2 px-4 py-2
                           text-sm font-medium text-primary-600 bg-primary-50
                           rounded-lg hover:bg-primary-100 transition-colors"
                aria-label={`Call ${item.phoneNumber}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                Call
              </button>
              <button
                onClick={handleText}
                className="touch-target inline-flex items-center gap-2 px-4 py-2
                           text-sm font-medium text-primary-600 bg-primary-50
                           rounded-lg hover:bg-primary-100 transition-colors"
                aria-label={`Text ${item.phoneNumber}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
                Text
              </button>
              <span className="text-sm text-neutral-500">{item.phoneNumber}</span>
            </div>
          )}

          {/* Links */}
          {item.links && item.links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.links.map((link) => (
                <a
                  key={link}
                  href={link.startsWith('http') ? link : `https://${link}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5
                             text-sm text-primary-600 bg-primary-50
                             rounded-lg hover:bg-primary-100 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate max-w-[180px]">
                    {link.replace(/^https?:\/\//, '').split('/')[0]}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit mode section */}
      {isEditing && isTask && (
        <div className="mt-4 pt-4 border-t border-neutral-100 space-y-5">
          {/* Schedule */}
          <div>
            <label htmlFor="scheduledFor" className="block text-sm font-medium text-neutral-700 mb-2">
              Scheduled For
            </label>
            <div className="flex gap-3">
              <input
                id="scheduledFor"
                type="datetime-local"
                step="900"
                value={getScheduledForInputValue()}
                onChange={handleScheduleChange}
                className="flex-1 px-4 py-3 text-base rounded-lg border border-neutral-200
                           bg-white
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                           transition-shadow"
              />
              {item.originalTask?.scheduledFor && (
                <button
                  type="button"
                  onClick={handleClearSchedule}
                  className="px-4 py-3 text-sm font-medium text-neutral-500
                             hover:text-danger-500 hover:bg-danger-50
                             rounded-lg transition-colors"
                  aria-label="Clear schedule"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Notes
            </label>
            <textarea
              value={item.notes || ''}
              onChange={handleNotesChange}
              placeholder="Add notes..."
              rows={3}
              className="w-full px-4 py-3 text-base rounded-lg border border-neutral-200
                         bg-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                         resize-none transition-shadow"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              value={item.phoneNumber || ''}
              onChange={handlePhoneChange}
              placeholder="Add phone number..."
              className="w-full px-4 py-3 text-base rounded-lg border border-neutral-200
                         bg-white
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                         transition-shadow"
            />
          </div>

          {/* Links */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Links
            </label>
            {item.links && item.links.length > 0 && (
              <ul className="mb-3 space-y-2">
                {item.links.map((link) => (
                  <li key={link} className="flex items-center gap-3 p-2 bg-neutral-50 rounded-lg">
                    <a
                      href={link.startsWith('http') ? link : `https://${link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 hover:underline truncate flex-1"
                    >
                      {link}
                    </a>
                    <button
                      onClick={() => handleRemoveLink(link)}
                      className="touch-target flex items-center justify-center
                                 text-neutral-400 hover:text-danger-500 transition-colors"
                      aria-label="Remove link"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={handleAddLink} className="flex gap-3">
              <input
                type="text"
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                placeholder="Add a link..."
                className="flex-1 px-4 py-3 text-base rounded-lg border border-neutral-200
                           bg-white
                           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                           transition-shadow"
              />
              <button
                type="submit"
                className="px-5 py-3 text-sm font-medium bg-neutral-100 text-neutral-700
                           rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Add
              </button>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
