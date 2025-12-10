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

interface CreateEventRequest {
  title: string
  description?: string
  startTime: string  // ISO 8601
  endTime: string    // ISO 8601
  location?: string
  allDay?: boolean
  timeZone?: string  // IANA timezone (e.g., 'America/New_York')
  requestId?: string // Idempotency key to prevent duplicate events
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

    const body: CreateEventRequest = await req.json()
    const { title, description, startTime, endTime, location, allDay, timeZone, requestId } = body

    if (!title || !startTime || !endTime) {
      return new Response(JSON.stringify({ error: 'Missing required fields: title, startTime, endTime' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    // Build Google Calendar API request body
    interface GoogleEventBody {
      summary: string
      description?: string
      location?: string
      start: { dateTime?: string; date?: string; timeZone?: string }
      end: { dateTime?: string; date?: string; timeZone?: string }
    }

    const eventBody: GoogleEventBody = {
      summary: title,
      start: {},
      end: {},
    }

    if (description) {
      eventBody.description = description
    }

    if (location) {
      eventBody.location = location
    }

    // Use provided timezone or default to America/New_York
    const eventTimeZone = timeZone || 'America/New_York'

    if (allDay) {
      // For all-day events, use date format (YYYY-MM-DD)
      // Extract just the date part from ISO string
      const startDate = startTime.split('T')[0]
      const endDate = endTime.split('T')[0]

      // Google requires end date to be the day AFTER the last day of the event
      // For a single all-day event, end should be the next day
      const endDateObj = new Date(endDate)
      endDateObj.setDate(endDateObj.getDate() + 1)
      const adjustedEndDate = endDateObj.toISOString().split('T')[0]

      eventBody.start = { date: startDate }
      eventBody.end = { date: adjustedEndDate }
    } else {
      // For timed events, use dateTime format with timezone
      eventBody.start = { dateTime: startTime, timeZone: eventTimeZone }
      eventBody.end = { dateTime: endTime, timeZone: eventTimeZone }
    }

    // Build the URL with optional idempotency key
    const createUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')

    // Google Calendar uses conferenceDataVersion for some features, but for idempotency
    // we can use a custom approach: check if event with same requestId exists
    // However, Google doesn't have native idempotency - we'll generate a unique event ID
    // Note: Google's recommended approach is to use the 'id' field in the request body
    // to provide a custom event ID that can be used for idempotency

    // If requestId provided, use it as a deterministic event ID
    // Google event IDs must be 5-1024 chars, lowercase letters, digits, or special chars
    interface GoogleEventBodyWithId extends GoogleEventBody {
      id?: string
    }
    const eventBodyWithId: GoogleEventBodyWithId = { ...eventBody }

    if (requestId) {
      // Convert requestId to a valid Google Calendar event ID format
      // Must be lowercase alphanumeric, 5-1024 characters
      const sanitizedId = requestId
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 1024)

      if (sanitizedId.length >= 5) {
        eventBodyWithId.id = sanitizedId
      }
    }

    // Create the event
    const createResponse = await fetch(
      createUrl.toString(),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBodyWithId),
      }
    )

    const createData = await createResponse.json()

    if (createData.error) {
      // Handle duplicate event ID (idempotency case)
      // If the event already exists with this ID, return success with the existing event
      if (createResponse.status === 409 && eventBodyWithId.id) {
        console.log('Event with this ID already exists, fetching existing event:', eventBodyWithId.id)

        // Fetch the existing event
        const getResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventBodyWithId.id}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        )

        if (getResponse.ok) {
          const existingEvent = await getResponse.json()
          return new Response(JSON.stringify({
            eventId: existingEvent.id,
            htmlLink: existingEvent.htmlLink,
            duplicate: true,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      console.error('Google Calendar API error:', createData.error)
      return new Response(JSON.stringify({ error: createData.error.message }), {
        status: createResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Event created successfully:', createData.id)

    return new Response(JSON.stringify({
      eventId: createData.id,
      htmlLink: createData.htmlLink,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in google-calendar-create-event:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
