import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

interface DeleteEventRequest {
  eventId: string
  calendarId?: string
  /** If true, delete the entire recurring series (parent event). Otherwise delete only this instance. */
  deleteSeries?: boolean
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
      return new Response(JSON.stringify({ error: 'Unauthorized', needsReconnect: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body: DeleteEventRequest = await req.json()
    const { eventId, deleteSeries } = body
    const calendarId = body.calendarId || 'primary'

    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Missing required field: eventId' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: connection, error: connError } = await supabaseAdmin
      .from('calendar_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single()

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'No calendar connection found', needsReconnect: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        throw err
      }
    }

    // For series deletes, look up the recurring parent and target that ID.
    // Google's instance-level DELETE only removes the single occurrence.
    let targetEventId = eventId
    if (deleteSeries) {
      const getUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
      const getResponse = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!getResponse.ok) {
        const errorText = await getResponse.text()
        console.error('Failed to load event for series delete:', getResponse.status, errorText)
        return new Response(JSON.stringify({
          error: 'Could not load event to delete series',
          statusCode: getResponse.status,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const eventData = await getResponse.json()
      // recurringEventId points to the parent if this is an instance.
      // If the event is itself the parent (top-level recurring), use eventId directly.
      targetEventId = eventData.recurringEventId || eventId
    }

    const deleteUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(targetEventId)}`
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    // Google returns 204 No Content on successful delete.
    // 410 Gone means already deleted — treat as success (idempotent).
    if (!deleteResponse.ok && deleteResponse.status !== 410) {
      const errorText = await deleteResponse.text()
      console.error('Google Calendar delete API error:', deleteResponse.status, errorText)

      let errorMessage = 'Failed to delete event'
      try {
        const errorData = JSON.parse(errorText)
        errorMessage = errorData.error?.message || errorMessage
      } catch {
        if (errorText) {
          errorMessage = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText
        }
      }

      return new Response(JSON.stringify({
        error: errorMessage,
        statusCode: deleteResponse.status,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Best-effort cache cleanup. If the row doesn't exist or RLS blocks,
    // we don't want to fail the user-visible delete.
    try {
      if (deleteSeries) {
        await supabaseAdmin
          .from('calendar_events')
          .delete()
          .eq('user_id', user.id)
          .or(`google_event_id.eq.${targetEventId},recurring_event_id.eq.${targetEventId}`)
      } else {
        await supabaseAdmin
          .from('calendar_events')
          .delete()
          .eq('user_id', user.id)
          .eq('google_event_id', eventId)
      }
    } catch (cacheErr) {
      console.warn('Cache cleanup after delete failed (non-fatal):', cacheErr)
    }

    return new Response(JSON.stringify({
      ok: true,
      eventId: targetEventId,
      deletedSeries: !!deleteSeries,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in google-calendar-delete-event:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
