import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function refreshAccessToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const tokenData = await tokenResponse.json()

  if (tokenData.error) {
    throw new Error(tokenData.error_description || tokenData.error)
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  await supabaseAdmin
    .from('calendar_connections')
    .update({
      access_token: tokenData.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'google')

  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { startDate, endDate } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user's calendar connection
    const { data: connection, error: connError } = await supabaseAdmin
      .from('calendar_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single()

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'No calendar connection found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if token needs refresh
    let accessToken = connection.access_token
    const expiresAt = new Date(connection.token_expires_at)
    const now = new Date()
    const fiveMinutes = 5 * 60 * 1000

    if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
      accessToken = await refreshAccessToken(supabaseAdmin, user.id, connection.refresh_token)
    }

    // First, get list of all calendars the user has access to
    const calendarListResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const calendarListData = await calendarListResponse.json()

    if (calendarListData.error) {
      return new Response(JSON.stringify({ error: calendarListData.error.message }), {
        status: calendarListResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch events from all calendars
    interface GoogleCalendar {
      id: string
      summary?: string
      selected?: boolean
    }
    interface GoogleCalendarEvent {
      id: string
      summary?: string
      description?: string
      location?: string
      start: { dateTime?: string; date?: string }
      end: { dateTime?: string; date?: string }
    }

    const calendars: GoogleCalendar[] = calendarListData.items || []

    // Log which calendars we're fetching from
    console.log('Fetching events from calendars:', calendars.map(c => ({ id: c.id, summary: c.summary })))

    const allEvents: Array<{
      user_id: string
      google_event_id: string
      title: string
      description: string | null
      start_time: string
      end_time: string
      all_day: boolean
      location: string | null
      calendar_id: string
      updated_at: string
    }> = []

    // Fetch events from each calendar in parallel
    const eventPromises = calendars.map(async (calendar) => {
      const eventsUrl = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`
      )
      eventsUrl.searchParams.set('timeMin', new Date(startDate).toISOString())
      eventsUrl.searchParams.set('timeMax', new Date(endDate).toISOString())
      eventsUrl.searchParams.set('singleEvents', 'true')
      eventsUrl.searchParams.set('orderBy', 'startTime')
      eventsUrl.searchParams.set('maxResults', '100')

      try {
        const eventsResponse = await fetch(eventsUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const eventsData = await eventsResponse.json()

        if (eventsData.error) {
          console.error(`Error fetching calendar ${calendar.id}:`, eventsData.error)
          return []
        }

        const items = eventsData.items || []
        console.log(`Calendar ${calendar.summary || calendar.id}: ${items.length} events found`)

        return items.map((event: GoogleCalendarEvent) => {
          const isAllDay = !event.start?.dateTime

          // For all-day events, keep the date as noon UTC to avoid timezone issues
          // This ensures the date doesn't shift when converted to/from ISO strings
          const startTime = isAllDay
            ? `${event.start.date}T12:00:00.000Z`
            : new Date(event.start.dateTime!).toISOString()
          const endTime = isAllDay
            ? `${event.end.date}T12:00:00.000Z`
            : new Date(event.end.dateTime!).toISOString()

          return {
            user_id: user.id,
            google_event_id: event.id,
            title: event.summary || '(No title)',
            description: event.description || null,
            start_time: startTime,
            end_time: endTime,
            all_day: isAllDay,
            location: event.location || null,
            calendar_id: calendar.id,
            updated_at: new Date().toISOString(),
          }
        })
      } catch (err) {
        console.error(`Error fetching calendar ${calendar.id}:`, err)
        return []
      }
    })

    // Wait for all calendar fetches to complete and flatten results
    const eventArrays = await Promise.all(eventPromises)
    const events = eventArrays.flat()

    // Upsert events to cache
    if (events.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('calendar_events')
        .upsert(events, { onConflict: 'user_id,google_event_id' })

      if (upsertError) {
        console.error('Failed to cache events:', upsertError)
      }
    }

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
