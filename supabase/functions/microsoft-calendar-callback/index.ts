// Exchanges the Microsoft auth code for tokens and stores them as this user's
// 'microsoft' calendar connection. Mirrors google-calendar-callback.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { MICROSOFT_AUTHORITY, MICROSOFT_SCOPES } from '../_shared/calendar-providers/microsoft.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
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
      return json({ error: 'Unauthorized' }, 401)
    }

    const { code, redirectUri } = await req.json()
    if (!code || !redirectUri) {
      return json({ error: 'Missing code or redirectUri' }, 400)
    }

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
    const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      return json({ error: 'Microsoft credentials not configured' }, 500)
    }

    const tokenResponse = await fetch(`${MICROSOFT_AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        scope: MICROSOFT_SCOPES.join(' '),
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error || !tokenData.access_token) {
      return json({ error: tokenData.error_description || tokenData.error || 'Token exchange failed' }, 400)
    }
    if (!tokenData.refresh_token) {
      // offline_access was not granted — without it the connection dies in an hour.
      return json({ error: 'Microsoft did not return a refresh token. Please try connecting again.' }, 400)
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: upsertError } = await supabaseAdmin
      .from('calendar_connections')
      .upsert({
        user_id: user.id,
        provider: 'microsoft',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      })

    if (upsertError) {
      return json({ error: upsertError.message }, 500)
    }

    return json({ success: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
