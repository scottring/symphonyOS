import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ════════════════════════════════════════════════════════════════
// AGENT PROXY — Authenticated streaming seam between Symphony's
// browser and the "Michael" agent engine (Open Brain).
//
// The browser calls this function with the user's Supabase JWT.
// We verify the JWT, then forward the request to the engine's SSE
// endpoint using a server-side secret (OPEN_BRAIN_API_KEY) so the
// engine key never reaches the browser. The SSE response is streamed
// straight back to the client.
//
// This replaces the browser-exposed VITE_OPEN_BRAIN_API_KEY for the
// assistant path.
//
// Auth: Requires user JWT (verified before any forwarding).
// ════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth — requires user JWT. Verify before any forwarding.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Parse request body
  const { message, channelId } = await req.json().catch(() => ({}))
  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Engine config — secret stays server-side, never sent to the browser.
  const engineUrl = Deno.env.get('OPEN_BRAIN_URL')
  const engineKey = Deno.env.get('OPEN_BRAIN_API_KEY')
  if (!engineUrl || !engineKey) {
    return new Response(JSON.stringify({ error: 'Engine not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Forward to the engine's SSE endpoint with the server-side secret.
  let upstream: Response
  try {
    upstream = await fetch(`${engineUrl}/api/agent-chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': engineKey },
      body: JSON.stringify({ message, channelId: channelId ?? 'web:default' }),
    })
  } catch (err) {
    console.error('agent-proxy: engine fetch failed:', err)
    return new Response(JSON.stringify({ error: 'Engine unreachable' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: 'Engine unreachable' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Stream the SSE body straight back to the client (not buffered).
  return new Response(upstream.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
})
