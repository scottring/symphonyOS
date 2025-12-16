import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Custom error class for token refresh failures
class TokenRefreshError extends Error {
  constructor(message: string, public readonly shouldDisconnect: boolean = false) {
    super(message)
    this.name = 'TokenRefreshError'
  }
}

async function refreshAccessToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string> {
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
    const permanentErrors = ['invalid_grant', 'invalid_client', 'unauthorized_client']
    const shouldDisconnect = permanentErrors.includes(tokenData.error)

    console.error('Token refresh failed:', tokenData.error, tokenData.error_description)

    const message = tokenData.error_description || tokenData.error
    throw new TokenRefreshError(message, shouldDisconnect)
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

interface UpdateEventRequest {
  eventId: string       // Google Calendar event ID
  calendarId?: string   // Calendar ID (defaults to looking up from cache or 'primary')
  startTime: string     // ISO 8601
  endTime: string       // ISO 8601
  allDay?: boolean
  timeZone?: string     // IANA timezone (e.g., 'America/New_York')
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

    const body: UpdateEventRequest = await req.json()
    console.log('Received request body:', JSON.stringify(body))

    const { eventId, startTime, endTime, allDay, timeZone } = body
    let { calendarId } = body

    if (!eventId || !startTime || !endTime) {
      console.error('Missing required fields:', { eventId, startTime, endTime })
      return new Response(JSON.stringify({
        error: 'Missing required fields: eventId, startTime, endTime',
        received: { eventId, startTime, endTime }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // If no calendarId provided, try to look it up from cached events
    if (!calendarId) {
      const { data: cachedEvent } = await supabaseAdmin
        .from('calendar_events')
        .select('calendar_id')
        .eq('user_id', user.id)
        .eq('google_event_id', eventId)
        .single()

      calendarId = cachedEvent?.calendar_id || 'primary'
    }

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
      try {
        accessToken = await refreshAccessToken(supabaseAdmin, user.id, connection.refresh_token)
      } catch (err) {
        if (err instanceof TokenRefreshError) {
          return new Response(JSON.stringify({
            error: err.message,
            errorCode: 'invalid_grant',
            needsReconnect: err.shouldDisconnect,
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        throw err
      }
    }

    // First, GET the existing event to get all its properties
    const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`

    console.log('Fetching existing event:', eventUrl)

    const getResponse = await fetch(eventUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!getResponse.ok) {
      const errorData = await getResponse.json()
      console.error('Failed to fetch event:', errorData)
      return new Response(JSON.stringify({
        error: 'Failed to fetch existing event',
        details: errorData,
        calendarId,
        eventId,
      }), {
        status: getResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const existingEvent = await getResponse.json()
    console.log('Existing event:', JSON.stringify(existingEvent, null, 2))

    // Use provided timezone or default to America/New_York
    const eventTimeZone = timeZone || 'America/New_York'

    // Modify the start and end times on the existing event
    if (allDay) {
      // For all-day events, use date format (YYYY-MM-DD)
      const startDate = startTime.split('T')[0]
      const endDate = endTime.split('T')[0]

      // Google requires end date to be the day AFTER the last day of the event
      const endDateObj = new Date(endDate)
      endDateObj.setDate(endDateObj.getDate() + 1)
      const adjustedEndDate = endDateObj.toISOString().split('T')[0]

      existingEvent.start = { date: startDate }
      existingEvent.end = { date: adjustedEndDate }
    } else {
      // For timed events, use dateTime with timeZone
      existingEvent.start = { dateTime: startTime, timeZone: eventTimeZone }
      existingEvent.end = { dateTime: endTime, timeZone: eventTimeZone }
    }

    console.log('Updated event body:', JSON.stringify({ start: existingEvent.start, end: existingEvent.end }))

    // Use PUT to replace the entire event (required when changing event type)
    const updateResponse = await fetch(eventUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(existingEvent),
    })

    const updateData = await updateResponse.json()

    if (updateData.error) {
      console.error('Google Calendar API error:', JSON.stringify(updateData.error, null, 2))
      console.error('Request body start/end was:', JSON.stringify({ start: existingEvent.start, end: existingEvent.end }, null, 2))
      return new Response(JSON.stringify({
        error: updateData.error.message || JSON.stringify(updateData.error),
        details: updateData.error,
        requestBody: { start: existingEvent.start, end: existingEvent.end },
        calendarId,
        eventId,
      }), {
        status: updateResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Event updated successfully:', updateData.id)

    // Update the cached event in our database
    const isAllDay = !updateData.start?.dateTime
    const updatedStartTime = isAllDay
      ? `${updateData.start.date}T12:00:00.000Z`
      : new Date(updateData.start.dateTime).toISOString()
    const updatedEndTime = isAllDay
      ? `${updateData.end.date}T12:00:00.000Z`
      : new Date(updateData.end.dateTime).toISOString()

    await supabaseAdmin
      .from('calendar_events')
      .update({
        start_time: updatedStartTime,
        end_time: updatedEndTime,
        all_day: isAllDay,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('google_event_id', eventId)

    return new Response(JSON.stringify({
      eventId: updateData.id,
      htmlLink: updateData.htmlLink,
      updated: {
        startTime: updatedStartTime,
        endTime: updatedEndTime,
        allDay: isAllDay,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in google-calendar-update-event:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
