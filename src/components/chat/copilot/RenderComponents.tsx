/**
 * CopilotKit Generative UI Components
 * Rich, interactive components rendered inline in the chat
 */

import { useState } from 'react'
import { Check, Clock, Calendar, ChevronRight, RotateCcw, User } from 'lucide-react'

// ============================================================================
// Task Card - Interactive task with complete/reschedule actions
// ============================================================================

interface TaskItemProps {
  id: string
  title: string
  scheduledFor?: string | null
  localTime?: string
  context?: 'work' | 'family' | 'personal' | null
  completed?: boolean
  projectName?: string
  assignedTo?: string
  onComplete?: (id: string) => void
  onReschedule?: (id: string, date: string) => void
  onNavigate?: (id: string) => void
}

export function TaskItem({
  id,
  title,
  localTime,
  context,
  completed = false,
  projectName,
  assignedTo,
  onComplete,
  onNavigate,
}: TaskItemProps) {
  const [isCompleted, setIsCompleted] = useState(completed)

  const handleComplete = () => {
    setIsCompleted(!isCompleted)
    onComplete?.(id)
  }

  const contextColors = {
    work: 'bg-blue-100 text-blue-700',
    family: 'bg-amber-100 text-amber-700',
    personal: 'bg-purple-100 text-purple-700',
  }

  return (
    <div
      className={`
        group flex items-center gap-3 p-3 rounded-xl border transition-all duration-200
        ${isCompleted
          ? 'bg-neutral-50 border-neutral-200'
          : 'bg-white border-neutral-200 hover:border-primary-300 hover:shadow-sm'
        }
      `}
    >
      {/* Checkbox */}
      <button
        onClick={handleComplete}
        className={`
          flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
          ${isCompleted
            ? 'bg-primary-500 border-primary-500 text-white'
            : 'border-neutral-300 hover:border-primary-400'
          }
        `}
      >
        {isCompleted && <Check className="w-3 h-3" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isCompleted ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
          {title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {localTime && (
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <Clock className="w-3 h-3" />
              {localTime}
            </span>
          )}
          {projectName && (
            <span className="text-xs text-neutral-400">#{projectName}</span>
          )}
          {assignedTo && (
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              <User className="w-3 h-3" />
              {assignedTo}
            </span>
          )}
        </div>
      </div>

      {/* Context badge */}
      {context && (
        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${contextColors[context]}`}>
          {context}
        </span>
      )}

      {/* Navigate button */}
      {onNavigate && (
        <button
          onClick={() => onNavigate(id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Event Card - Calendar event display
// ============================================================================

interface EventItemProps {
  id: string
  title: string
  localStartTime: string
  localEndTime?: string
  localDate?: string
  description?: string
  allDay?: boolean
  onNavigate?: (id: string) => void
}

export function EventItem({
  id,
  title,
  localStartTime,
  localEndTime,
  allDay,
  onNavigate,
}: EventItemProps) {
  return (
    <div
      className="group flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-primary-50 to-transparent border border-primary-100 hover:border-primary-200 transition-all"
    >
      {/* Calendar icon */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
        <Calendar className="w-5 h-5 text-primary-600" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-800 truncate">{title}</p>
        <p className="text-xs text-primary-600">
          {allDay ? 'All day' : `${localStartTime}${localEndTime ? ` - ${localEndTime}` : ''}`}
        </p>
      </div>

      {/* Navigate button */}
      {onNavigate && (
        <button
          onClick={() => onNavigate(id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-primary-400 hover:text-primary-600 hover:bg-primary-100 transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Routine Card - Routine with completion status
// ============================================================================

interface RoutineItemProps {
  id: string
  name: string
  timeOfDay?: string
  status: 'pending' | 'completed' | 'skipped'
  onComplete?: (id: string) => void
  onSkip?: (id: string) => void
}

export function RoutineItem({
  id,
  name,
  timeOfDay,
  status,
  onComplete,
  onSkip,
}: RoutineItemProps) {
  const [currentStatus, setCurrentStatus] = useState(status)

  const handleComplete = () => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    setCurrentStatus(newStatus)
    onComplete?.(id)
  }

  const handleSkip = () => {
    setCurrentStatus('skipped')
    onSkip?.(id)
  }

  return (
    <div
      className={`
        group flex items-center gap-3 p-3 rounded-xl border transition-all
        ${currentStatus === 'completed'
          ? 'bg-sage-50 border-sage-200'
          : currentStatus === 'skipped'
          ? 'bg-neutral-50 border-neutral-200'
          : 'bg-gradient-to-r from-sage-50/50 to-transparent border-sage-100 hover:border-sage-200'
        }
      `}
    >
      {/* Status indicator */}
      <button
        onClick={handleComplete}
        className={`
          flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
          ${currentStatus === 'completed'
            ? 'bg-sage-500 border-sage-500 text-white'
            : 'border-sage-300 hover:border-sage-400'
          }
        `}
      >
        {currentStatus === 'completed' && <Check className="w-3 h-3" />}
      </button>

      {/* Routine icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-sage-100 flex items-center justify-center">
        <RotateCcw className="w-4 h-4 text-sage-600" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${currentStatus !== 'pending' ? 'text-neutral-400' : 'text-neutral-800'}`}>
          {name}
        </p>
        {timeOfDay && (
          <p className="text-xs text-sage-600">{timeOfDay}</p>
        )}
      </div>

      {/* Skip button */}
      {currentStatus === 'pending' && onSkip && (
        <button
          onClick={handleSkip}
          className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded-md text-xs text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-all"
        >
          Skip
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Schedule List - Container for multiple items
// ============================================================================

interface ScheduleListProps {
  title?: string
  subtitle?: string
  children: React.ReactNode
  status?: 'loading' | 'complete' | 'error'
}

export function ScheduleList({ title, subtitle, children, status = 'complete' }: ScheduleListProps) {
  return (
    <div className="my-2 rounded-2xl bg-white border border-neutral-200 overflow-hidden shadow-sm">
      {(title || subtitle) && (
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50">
          {title && <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>}
          {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="p-2 space-y-2">
        {status === 'loading' ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Action Confirmation - For when AI takes actions
// ============================================================================

interface ActionConfirmationProps {
  action: string
  description: string
  status: 'pending' | 'success' | 'error'
  onUndo?: () => void
}

export function ActionConfirmation({ action, description, status, onUndo }: ActionConfirmationProps) {
  const statusStyles = {
    pending: 'bg-amber-50 border-amber-200 text-amber-700',
    success: 'bg-green-50 border-green-200 text-green-700',
    error: 'bg-red-50 border-red-200 text-red-700',
  }

  const statusIcons = {
    pending: <Clock className="w-4 h-4" />,
    success: <Check className="w-4 h-4" />,
    error: <span className="text-sm">!</span>,
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${statusStyles[status]}`}>
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-current/10 flex items-center justify-center">
        {statusIcons[status]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{action}</p>
        <p className="text-xs opacity-80">{description}</p>
      </div>
      {status === 'success' && onUndo && (
        <button
          onClick={onUndo}
          className="text-xs font-medium hover:underline"
        >
          Undo
        </button>
      )}
    </div>
  )
}
