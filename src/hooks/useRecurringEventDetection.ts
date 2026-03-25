import { useMemo } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'

export interface SuggestedPromotion {
  /** Normalized (lowercased, trimmed) event title */
  title: string
  /** Display-friendly title (from the first occurrence) */
  displayTitle: string
  /** How many times this event appears */
  occurrenceCount: number
  /** Google event IDs for all occurrences */
  eventIds: string[]
}

/**
 * Detects recurring calendar events that don't yet have linked projects.
 * Returns suggestions for events that appear 2+ times in the current view.
 *
 * Usage:
 *   const { suggestedPromotions, isPromotionSuggested } = useRecurringEventDetection(events, eventNotesMap)
 */
export function useRecurringEventDetection(
  events: CalendarEvent[],
  eventNotesMap?: Map<string, EventNote>,
) {
  const suggestedPromotions = useMemo(() => {
    if (!events || events.length === 0) return []

    // Group events by normalized title
    const groups = new Map<string, { displayTitle: string; eventIds: string[] }>()

    for (const event of events) {
      const normalized = event.title.toLowerCase().trim()
      const eventId = event.google_event_id || event.id

      const existing = groups.get(normalized)
      if (existing) {
        existing.eventIds.push(eventId)
      } else {
        groups.set(normalized, {
          displayTitle: event.title,
          eventIds: [eventId],
        })
      }
    }

    // Filter to recurring (2+ occurrences) without linked projects
    const suggestions: SuggestedPromotion[] = []

    for (const [title, group] of groups) {
      if (group.eventIds.length < 2) continue

      // Check if any occurrence already has a linked project
      const hasLinkedProject = group.eventIds.some(id => {
        const note = eventNotesMap?.get(id)
        return note?.projectId != null
      })

      if (hasLinkedProject) continue

      suggestions.push({
        title,
        displayTitle: group.displayTitle,
        occurrenceCount: group.eventIds.length,
        eventIds: group.eventIds,
      })
    }

    // Sort by occurrence count descending
    return suggestions.sort((a, b) => b.occurrenceCount - a.occurrenceCount)
  }, [events, eventNotesMap])

  // Quick lookup: is a given event ID part of a suggested promotion?
  const suggestedEventIds = useMemo(() => {
    const ids = new Set<string>()
    for (const promo of suggestedPromotions) {
      for (const id of promo.eventIds) {
        ids.add(id)
      }
    }
    return ids
  }, [suggestedPromotions])

  const isPromotionSuggested = useMemo(() => {
    return (eventId: string) => suggestedEventIds.has(eventId)
  }, [suggestedEventIds])

  return { suggestedPromotions, isPromotionSuggested }
}
