import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyOAuthState } from '../_shared/oauthState.ts'
import { readProviderEnv } from '../_shared/calendar-providers/index.ts'
import { saveConnection } from '../_shared/calendar-providers/saveConnection.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { code, redirectUri, state } = await req.json()

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Google credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // The round trip must be the one this person started (oauthState.ts): a
    // state that is missing, forged or someone else's is refused before any
    // token is exchanged or stored.
    const verified = typeof redirectUri === 'string' && await verifyOAuthState(clientSecret, state, user.id, 'google', redirectUri)
    if (!verified || typeof code !== 'string' || !code) {
      return new Response(JSON.stringify({ error: 'This sign-in link has expired or is invalid. Start the connection again from Calendar settings.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data: consumed, error: consumeError } = await supabaseAdmin.rpc('consume_oauth_transaction', {
      p_nonce: verified.nonce, p_user: user.id, p_provider: 'google', p_redirect: redirectUri,
    })
    if (consumeError || consumed !== true) {
      return new Response(JSON.stringify({ error: 'This sign-in link has already been used or expired. Start the connection again from Calendar settings.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      return new Response(JSON.stringify({ error: tokenData.error_description || tokenData.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // One row per account: the same account again refreshes its row, another
    // account is added beside it (saveConnection.ts).
    const saved = await saveConnection(supabaseAdmin, {
      userId: user.id,
      provider: 'google',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresInSeconds: tokenData.expires_in,
      // What Google says was granted (space-separated); mail features check this.
      grantedScopes: typeof tokenData.scope === 'string' ? tokenData.scope : null,
    }, readProviderEnv((n) => Deno.env.get(n)))

    if (saved.error) {
      return new Response(JSON.stringify({ error: saved.error }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, accountEmail: saved.accountEmail }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
