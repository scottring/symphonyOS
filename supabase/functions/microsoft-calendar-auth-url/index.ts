// Builds the Microsoft sign-in URL for connecting an Outlook / Microsoft 365
// calendar (reads only). Mirrors google-calendar-auth-url. The provider rides
// in `state` so the single /calendar-callback page knows which callback to hit.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildMicrosoftAuthUrl } from '../_shared/calendar-providers/microsoft.ts'

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
    if (!redirectUri) {
      return json({ error: 'Missing redirectUri' }, 400)
    }

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
    if (!clientId) {
      return json({ error: 'MICROSOFT_CLIENT_ID not configured in Edge Function secrets' }, 500)
    }

    const state = btoa(JSON.stringify({ userId: user.id, provider: 'microsoft' }))
    const url = buildMicrosoftAuthUrl({ clientId, redirectUri, state })

    return json({ url })
  } catch (error) {
    console.error('Error in microsoft-calendar-auth-url:', error)
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
