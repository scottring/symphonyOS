import { memo } from 'react'
import { useLongPress } from '@/hooks/useLongPress'

interface TaskCheckboxProps {
  completed: boolean
  isWaiting?: boolean
  onToggleComplete: () => void
  onToggleWaiting: () => void
  isRoutine?: boolean
  contextColor?: string
  className?: string
}

export const TaskCheckbox = memo(function TaskCheckbox({
  completed,
  isWaiting,
  onToggleComplete,
  onToggleWaiting,
  isRoutine,
  contextColor,
  className = '',
}: TaskCheckboxProps) {
  const { pressing, handlers } = useLongPress({
    threshold: 1500,
    onLongPress: onToggleWaiting,
    onPress: onToggleComplete,
  })

  const label = completed
    ? 'Mark incomplete'
    : isWaiting
      ? 'Waiting — tap to complete, hold to cancel'
      : 'Mark complete (hold to mark waiting)'

  return (
    <button
      {...handlers}
      className={`touch-target flex items-center justify-center -m-2 p-2 ${className}`}
      aria-label={label}
    >
      <span
        className={`
          w-5 h-5 border-2 flex items-center justify-center transition-colors relative bg-bg-base
          ${isRoutine ? 'rounded-full' : 'rounded-md'}
          ${pressing ? 'long-press-ring' : ''}
          ${completed
            ? 'bg-primary-500 border-primary-500 text-white'
            : isWaiting
              ? 'checkbox-waiting'
              : contextColor
                ? 'hover:opacity-80'
                : 'border-neutral-300 hover:border-primary-400'
          }
        `}
        style={!completed && !isWaiting && contextColor ? { borderColor: contextColor } : undefined}
      >
        {completed ? (
          // Checkmark
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : isWaiting ? (
          // Clock icon
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
          </svg>
        ) : null}
      </span>
    </button>
  )
})
