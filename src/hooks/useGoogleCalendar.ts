import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface CalendarEvent {
  // Support both snake_case (from edge function) and camelCase (possibly cached/transformed)
  id: string
  google_event_id?: string
  title: string
  description?: string | null
  // Snake case from API
  start_time?: string
  end_time?: string
  all_day?: boolean
  // Camel case (observed in runtime)
  startTime?: string
  endTime?: string
  allDay?: boolean
  location?: string | null
}

export function useGoogleCalendar() {
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  // Check connection status
  useEffect(() => {
    async function checkConnection() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setIsConnected(false)
          setIsLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('calendar_connections')
          .select('id')
          .eq('user_id', user.id)
          .eq('provider', 'google')
          .single()

        setIsConnected(!error && !!data)
      } catch {
        setIsConnected(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkConnection()
  }, [])

  // Connect to Google Calendar
  const connect = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-auth-url', {
        body: {
          redirectUri: `${window.location.origin}/calendar-callback`,
        },
      })

      if (error) {
        // Try to get the actual error message from the response
        console.error('Edge function error:', error)
        // The error context might have the response body
        if ('context' in error && error.context) {
          try {
            const errorBody = await (error.context as Response).json()
            console.error('Error details:', errorBody)
          } catch {
            // ignore
          }
        }
        throw error
      }

      if (!data?.url) {
        console.error('No URL returned from edge function:', data)
        throw new Error(data?.error || 'No auth URL returned')
      }

      // Redirect to Google OAuth
      window.location.href = data.url
    } catch (err) {
      console.error('Failed to connect:', err)
      throw err
    }
  }, [])

  // Disconnect from Google Calendar
  const disconnect = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('calendar_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'google')

      setIsConnected(false)
      setEvents([])
    } catch (err) {
      console.error('Failed to disconnect:', err)
      throw err
    }
  }, [])

  // Fetch events for a date range
  const fetchEvents = useCallback(async (startDate: Date, endDate: Date) => {
    if (!isConnected) {
      setEvents([])
      return []
    }

    // Set fetching state and clear error
    setError(null)
    setIsFetching(true)

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('google-calendar-events', {
        body: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      })

      if (fetchError) throw fetchError

      // Check for auth errors that might indicate token refresh failure
      if (data?.error) {
        // Common auth error patterns
        if (data.error.includes('Unauthorized') || data.error.includes('invalid_grant') || data.error.includes('Token')) {
          setError('Calendar connection expired. Please reconnect.')
          setIsConnected(false)
          return []
        }
        throw new Error(data.error)
      }

      setEvents(data.events || [])
      return data.events || []
    } catch (err) {
      console.error('Failed to fetch events:', err)
      const message = err instanceof Error ? err.message : 'Failed to fetch events'
      setError(message)
      setEvents([])
      return []
    } finally {
      setIsFetching(false)
    }
  }, [isConnected])

  // Fetch today's events
  const fetchTodayEvents = useCallback(async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return fetchEvents(today, tomorrow)
  }, [fetchEvents])

  // Fetch this week's events
  const fetchWeekEvents = useCallback(async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    return fetchEvents(today, nextWeek)
  }, [fetchEvents])

  return {
    isConnected,
    isLoading,
    isFetching,
    events,
    error,
    connect,
    disconnect,
    fetchEvents,
    fetchTodayEvents,
    fetchWeekEvents,
  }
}
