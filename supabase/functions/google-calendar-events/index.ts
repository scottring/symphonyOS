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

    // Fetch events from Google Calendar
    const calendarId = connection.calendar_id || 'primary'
    const eventsUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
    eventsUrl.searchParams.set('timeMin', new Date(startDate).toISOString())
    eventsUrl.searchParams.set('timeMax', new Date(endDate).toISOString())
    eventsUrl.searchParams.set('singleEvents', 'true')
    eventsUrl.searchParams.set('orderBy', 'startTime')
    eventsUrl.searchParams.set('maxResults', '250')

    const eventsResponse = await fetch(eventsUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const eventsData = await eventsResponse.json()

    if (eventsData.error) {
      return new Response(JSON.stringify({ error: eventsData.error.message }), {
        status: eventsResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Transform and cache events
    interface GoogleCalendarEvent {
      id: string
      summary?: string
      start: { dateTime?: string; date?: string }
      end: { dateTime?: string; date?: string }
    }
    const events = (eventsData.items || []).map((event: GoogleCalendarEvent) => {
      const isAllDay = !event.start?.dateTime
      const startTime = isAllDay
        ? new Date(event.start.date + 'T12:00:00Z')
        : new Date(event.start.dateTime)
      const endTime = isAllDay
        ? new Date(event.end.date + 'T12:00:00Z')
        : new Date(event.end.dateTime)

      return {
        user_id: user.id,
        google_event_id: event.id,
        title: event.summary || '(No title)',
        description: event.description || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        all_day: isAllDay,
        location: event.location || null,
        calendar_id: calendarId,
        updated_at: new Date().toISOString(),
      }
    })

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
