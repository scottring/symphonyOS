import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface CreateEventParams {
  title: string
  description?: string
  startTime: Date
  endTime: Date
  location?: string
  allDay?: boolean
  /** Optional timezone (e.g., 'America/New_York'). Defaults to browser timezone. */
  timeZone?: string
  /** Optional idempotency key to prevent duplicate events on retry */
  requestId?: string
}

/** Error thrown when calendar needs reconnection due to expired/revoked permissions */
export class CalendarReconnectError extends Error {
  constructor(message: string = 'Calendar connection expired. Please reconnect.') {
    super(message)
    this.name = 'CalendarReconnectError'
  }
}

export interface CreateEventResult {
  id: string
  htmlLink?: string
}

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
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  // Check connection status and validate token
  useEffect(() => {
    async function checkAndValidateConnection() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setIsConnected(false)
          setNeedsReconnect(false)
          setIsLoading(false)
          return
        }

        // Get connection with token expiry info
        const { data: connection, error: connError } = await supabase
          .from('calendar_connections')
          .select('id, token_expires_at')
          .eq('user_id', user.id)
          .eq('provider', 'google')
          .single()

        if (connError || !connection) {
          setIsConnected(false)
          setNeedsReconnect(false)
          setIsLoading(false)
          return
        }

        // Connection exists - now validate it by making a test API call
        // This will trigger token refresh if needed and catch invalid refresh tokens
        const { data, error: validateError } = await supabase.functions.invoke('google-calendar-events', {
          body: {
            startDate: new Date().toISOString(),
            endDate: new Date().toISOString(),
          },
        })

        if (validateError || data?.error) {
          const errorMsg = data?.error || validateError?.message || ''
          // Check for auth-related errors indicating the connection is broken
          if (
            errorMsg.includes('invalid_grant') ||
            errorMsg.includes('Token has been expired or revoked') ||
            errorMsg.includes('Unauthorized') ||
            errorMsg.includes('No calendar connection found')
          ) {
            console.warn('Calendar connection invalid, needs reconnect:', errorMsg)
            setIsConnected(false)
            setNeedsReconnect(true)
            setError('Calendar connection expired. Please reconnect.')
          } else {
            // Other errors - connection might still be valid
            console.warn('Calendar validation failed but connection may be valid:', errorMsg)
            setIsConnected(true)
            setNeedsReconnect(false)
          }
        } else {
          // Connection is valid
          setIsConnected(true)
          setNeedsReconnect(false)
          setError(null)
        }
      } catch (err) {
        console.error('Error checking calendar connection:', err)
        setIsConnected(false)
        setNeedsReconnect(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAndValidateConnection()
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
        if (
          data.error.includes('Unauthorized') ||
          data.error.includes('invalid_grant') ||
          data.error.includes('Token has been expired or revoked') ||
          data.error.includes('Token')
        ) {
          setError('Calendar connection expired. Please reconnect.')
          setIsConnected(false)
          setNeedsReconnect(true)
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

  // Create a new calendar event
  // Throws CalendarReconnectError if permissions are expired (catch this to show reconnect UI)
  const createEvent = useCallback(async (params: CreateEventParams): Promise<CreateEventResult> => {
    if (!isConnected) {
      throw new Error('Not connected to Google Calendar')
    }

    // Default to browser timezone if not specified
    const timeZone = params.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone

    const { data, error } = await supabase.functions.invoke('google-calendar-create-event', {
      body: {
        title: params.title,
        description: params.description,
        startTime: params.startTime.toISOString(),
        endTime: params.endTime.toISOString(),
        location: params.location,
        allDay: params.allDay,
        timeZone,
        requestId: params.requestId,
      },
    })

    if (error) throw error

    // Check for auth errors that require reconnection
    if (data?.error) {
      const isAuthError =
        data.error.includes('Unauthorized') ||
        data.error.includes('invalid_grant') ||
        data.error.includes('Token has been expired or revoked') ||
        data.needsReconnect

      if (isAuthError) {
        setError('Calendar connection expired. Please reconnect.')
        setIsConnected(false)
        setNeedsReconnect(true)
        throw new CalendarReconnectError()
      }
      throw new Error(data.error)
    }

    return { id: data.eventId, htmlLink: data.htmlLink }
  }, [isConnected])

  return {
    isConnected,
    needsReconnect,
    isLoading,
    isFetching,
    events,
    error,
    connect,
    disconnect,
    fetchEvents,
    fetchTodayEvents,
    fetchWeekEvents,
    createEvent,
  }
}
