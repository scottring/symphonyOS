import { useState, useEffect, useMemo } from 'react'

interface BadgeVisibility {
  showInboxBadge: boolean
  showReviewBadge: boolean
}

/**
 * Hook to control time-based visibility of notification badges.
 *
 * - Inbox badge: Shows in the morning (before 10am) to encourage inbox triage
 * - Review badge: Shows in late afternoon (4pm-6pm) to prompt daily review
 *
 * This creates a natural rhythm:
 * - Morning: Process inbox items that accumulated overnight
 * - Afternoon: Review what's incomplete/overdue before ending the day
 */
export function useBadgeVisibility(): BadgeVisibility {
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours())

  // Update the hour every minute to catch transitions
  useEffect(() => {
    const updateHour = () => {
      setCurrentHour(new Date().getHours())
    }

    // Check every minute
    const interval = setInterval(updateHour, 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  const visibility = useMemo(() => {
    // Inbox badge: Show before 10am (morning triage time)
    const showInboxBadge = currentHour < 10

    // Review badge: Show between 4pm (16:00) and 6pm (18:00)
    const showReviewBadge = currentHour >= 16 && currentHour < 18

    return {
      showInboxBadge,
      showReviewBadge,
    }
  }, [currentHour])

  return visibility
}
