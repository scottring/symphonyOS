// Exchanges the Microsoft auth code for tokens and stores them as one of this
// user's Outlook accounts. Mirrors google-calendar-callback, state check included.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { MICROSOFT_AUTHORITY, MICROSOFT_SCOPES } from '../_shared/calendar-providers/microsoft.ts'
import { readProviderEnv } from '../_shared/calendar-providers/index.ts'
import { saveConnection } from '../_shared/calendar-providers/saveConnection.ts'
import { verifyOAuthState } from '../_shared/oauthState.ts'

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

    const { code, redirectUri, state } = await req.json()

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
    const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      return json({ error: 'Microsoft credentials not configured' }, 500)
    }

    // The round trip must be the one this person started (oauthState.ts): a
    // state that is missing, forged or someone else's is refused before any
    // token is exchanged or stored.
    const verified = typeof redirectUri === 'string' && await verifyOAuthState(clientSecret, state, user.id, 'microsoft', redirectUri)
    if (!verified || typeof code !== 'string' || !code) {
      return json({ error: 'This sign-in link has expired or is invalid. Start the connection again from Calendar settings.' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: consumed, error: consumeError } = await supabaseAdmin.rpc('consume_oauth_transaction', {
      p_nonce: verified.nonce, p_user: user.id, p_provider: 'microsoft', p_redirect: redirectUri,
    })
    if (consumeError || consumed !== true) {
      return json({ error: 'This sign-in link has already been used or expired. Start the connection again from Calendar settings.' }, 400)
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

    const saved = await saveConnection(supabaseAdmin, {
      userId: user.id,
      provider: 'microsoft',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in,
    }, readProviderEnv((n) => Deno.env.get(n)))

    if (saved.error) {
      return json({ error: saved.error }, 500)
    }

    return json({ success: true, accountEmail: saved.accountEmail })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
