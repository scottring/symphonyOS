// Builds the Microsoft sign-in URL for connecting an Outlook / Microsoft 365
// calendar (reads only). Mirrors google-calendar-auth-url, including its
// signed, one-use state (oauthState.ts): the callback refuses a round trip
// this person did not start. The provider rides in `state` so the single
// /calendar-callback page knows which callback to hit.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildMicrosoftAuthUrl } from '../_shared/calendar-providers/microsoft.ts'
import { ALLOWED_REDIRECTS, signOAuthState } from '../_shared/oauthState.ts'

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

    let body: { redirectUri?: string } = {}
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    const { redirectUri } = body
    if (typeof redirectUri !== 'string' || !ALLOWED_REDIRECTS.includes(redirectUri)) {
      return json({ error: 'Start the calendar connection from Symphony’s published app or approved test version.' }, 400)
    }

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
    const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      return json({ error: 'MICROSOFT_CLIENT_ID not configured in Edge Function secrets' }, 500)
    }

    // Signed and bound to this person: the callback refuses any other state.
    const state = await signOAuthState(clientSecret, { userId: user.id, provider: 'microsoft', redirectUri })
    const transaction = JSON.parse(atob(state))
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { error: transactionError } = await admin.from('oauth_transactions').insert({
      nonce: transaction.nonce, user_id: user.id, provider: 'microsoft', redirect_uri: redirectUri,
      expires_at: new Date(transaction.expiresAt).toISOString(),
    })
    if (transactionError) throw new Error('Could not start the calendar connection. Please try again.')
    const url = buildMicrosoftAuthUrl({ clientId, redirectUri, state })

    return json({ url })
  } catch (error) {
    console.error('Error in microsoft-calendar-auth-url:', error)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
