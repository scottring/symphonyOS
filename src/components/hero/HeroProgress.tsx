import { useMemo } from 'react'

interface HeroProgressProps {
  total: number
  current: number
  completedCount: number
}

/**
 * HeroProgress - Progress dots indicator
 *
 * Elegant dots showing progress through the task queue.
 * Completed dots fill in, current dot pulses gently.
 */
export function HeroProgress({
  total,
  current,
  completedCount,
}: HeroProgressProps) {
  // Limit visible dots for very long queues
  const maxVisibleDots = 9
  const shouldCondense = total > maxVisibleDots

  // Calculate which dots to show when condensed
  const visibleRange = useMemo(() => {
    if (!shouldCondense) {
      return { start: 0, end: total }
    }

    // Show dots around current position
    const halfWindow = Math.floor(maxVisibleDots / 2)
    let start = Math.max(0, current - halfWindow)
    let end = Math.min(total, start + maxVisibleDots)

    // Adjust start if we're near the end
    if (end === total) {
      start = Math.max(0, total - maxVisibleDots)
    }

    return { start, end }
  }, [total, current, shouldCondense])

  const visibleDots = useMemo(() => {
    const dots = []
    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      dots.push(i)
    }
    return dots
  }, [visibleRange])

  // Determine if each position is completed (processed and moved past)
  const isCompleted = (index: number) => index < current

  return (
    <div className="flex items-center gap-2">
      {/* Leading ellipsis if condensed and not at start */}
      {shouldCondense && visibleRange.start > 0 && (
        <span className="text-neutral-300 text-xs">•••</span>
      )}

      {/* Progress dots */}
      {visibleDots.map((index) => {
        const completed = isCompleted(index)
        const isCurrent = index === current

        return (
          <div
            key={index}
            className={`
              w-2.5 h-2.5 rounded-full transition-all duration-300
              ${isCurrent
                ? 'bg-primary-500 hero-dot-current'
                : completed
                  ? 'bg-primary-400'
                  : 'bg-neutral-200'
              }
            `}
            style={{
              transform: isCurrent ? 'scale(1.2)' : 'scale(1)',
            }}
            aria-hidden="true"
          />
        )
      })}

      {/* Trailing ellipsis if condensed and not at end */}
      {shouldCondense && visibleRange.end < total && (
        <span className="text-neutral-300 text-xs">•••</span>
      )}

      {/* Screen reader text */}
      <span className="sr-only">
        Task {current + 1} of {total}
        {completedCount > 0 && `, ${completedCount} completed`}
      </span>
    </div>
  )
}

export default HeroProgress
