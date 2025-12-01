import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'symphony-completed-events'

/**
 * Hook to track completed events in localStorage.
 * Events are identified by their Google event ID.
 * Completed events are stored with a timestamp for potential cleanup.
 */
export function useCompletedEvents() {
  const [completedEvents, setCompletedEvents] = useState<Record<string, number>>({})

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Clean up entries older than 30 days
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
        const cleaned: Record<string, number> = {}
        for (const [id, timestamp] of Object.entries(parsed)) {
          if (typeof timestamp === 'number' && timestamp > thirtyDaysAgo) {
            cleaned[id] = timestamp
          }
        }
        setCompletedEvents(cleaned)
        // Save cleaned version back
        if (Object.keys(cleaned).length !== Object.keys(parsed).length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
        }
      }
    } catch {
      // Invalid JSON, reset
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  // Save to localStorage whenever completedEvents changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedEvents))
  }, [completedEvents])

  const isEventCompleted = useCallback(
    (eventId: string): boolean => {
      return eventId in completedEvents
    },
    [completedEvents]
  )

  const toggleEventCompleted = useCallback((eventId: string) => {
    setCompletedEvents((prev) => {
      const next = { ...prev }
      if (eventId in next) {
        delete next[eventId]
      } else {
        next[eventId] = Date.now()
      }
      return next
    })
  }, [])

  return {
    isEventCompleted,
    toggleEventCompleted,
  }
}
