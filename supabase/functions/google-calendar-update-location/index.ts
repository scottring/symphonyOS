import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  eventId: string  // Google Calendar event ID
  location?: string | null  // null to remove location
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
    const { eventId, location } = body

    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Missing required field: eventId' }), {
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

    // Use PATCH instead of PUT to update only specific fields
    // This avoids issues with read-only fields
    const updateBody: { location?: string } = {}

    if (location !== undefined) {
      if (location === null) {
        // To remove location, set it to empty string
        updateBody.location = ''
      } else {
        updateBody.location = location
      }
    }

    // Update the event using PATCH
    const updateResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateBody),
      }
    )

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('Google Calendar API error:', updateResponse.status, errorText)

      let errorMessage = 'Failed to update event location'
      try {
        const errorData = JSON.parse(errorText)
        errorMessage = errorData.error?.message || errorMessage
      } catch (e) {
        // If can't parse JSON, use raw text
        errorMessage = errorText || errorMessage
      }

      return new Response(JSON.stringify({
        error: errorMessage,
        statusCode: updateResponse.status
      }), {
        status: updateResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const updateData = await updateResponse.json()
    console.log('Event updated successfully:', updateData.id)

    return new Response(JSON.stringify({
      eventId: updateData.id,
      location: updateData.location || null,
      htmlLink: updateData.htmlLink,
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
