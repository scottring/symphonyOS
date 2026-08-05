import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

/** Far enough forward to cover every relative tile, including "this month". */
export const DAY_LOAD_RANGE_DAYS = 45

export interface DayLoadEvents {
  events: CalendarEvent[]
  available: boolean
  loading: boolean
}

// Session cache. The scheduler opens often; the calendar does not change often.
let cache: CalendarEvent[] | null = null
let cacheFailed = false
let inflight: Promise<void> | null = null

/** Test-only: clear the module cache between cases. */
export function __resetDayLoadCache(): void {
  cache = null
  cacheFailed = false
  inflight = null
}

/**
 * Calendar events for the fullness readout, in their OWN cache.
 *
 * This deliberately does not read GoogleCalendarProvider. That provider's
 * fetchEvents REPLACES its state rather than merging into it
 * (`setEvents(data.events || [])`), and Today fetches only the viewed day — so
 * reading from it would see a single day of events and report every other day
 * as empty, which is exactly the lying-count failure the fullness bar exists to
 * avoid. Widening ITS fetch is worse: it would blank the events in the view
 * behind the open panel, the same failure HomeViewContainer already carries a
 * restore-hack for.
 *
 * So: one extra call, held here, touching nothing on screen.
 */
export function useDayLoadEvents(enabled: boolean): DayLoadEvents {
  const [, force] = useState(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || cache !== null || cacheFailed || inflight) return

    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + DAY_LOAD_RANGE_DAYS)

    inflight = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('google-calendar-events', {
          body: {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            // Domain filtering applies to tasks, not calendars — a day is full
            // regardless of which domain filled it.
            domain: 'universal',
          },
        })
        if (error || data?.error) throw error ?? new Error(String(data.error))
        cache = (data?.events ?? []) as CalendarEvent[]
      } catch {
        // A failed fetch must NOT read as "these days are free".
        cacheFailed = true
      } finally {
        inflight = null
        if (mounted.current) force((n) => n + 1)
      }
    })()

    void inflight
  }, [enabled])

  return {
    events: cache ?? [],
    available: cache !== null,
    loading: enabled && cache === null && !cacheFailed,
  }
}
