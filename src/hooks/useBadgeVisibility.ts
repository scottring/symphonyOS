import { useState, useEffect, useMemo } from 'react'

interface BadgeVisibility {
  showInboxBadge: boolean
}

/**
 * Hook to control time-based visibility of notification badges.
 *
 * - Inbox badge: Shows in the morning (before 10am) to encourage inbox triage
 *
 * This creates a natural rhythm:
 * - Morning: Process inbox items that accumulated overnight
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

    return {
      showInboxBadge,
    }
  }, [currentHour])

  return visibility
}
