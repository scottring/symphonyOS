// OPEN-BRAIN-PROXY — the browser's only way to Open Brain (2026-10-10).
//
// The Open Brain key used to be bundled into the web app as
// VITE_OPEN_BRAIN_API_KEY, readable by anyone who loaded the site. Now the key
// lives only here (the OPEN_BRAIN_API_KEY secret action-queue already uses).
// The browser sends its Supabase session; this function lets through only the
// vault owner (VAULT_OWNER_USER_ID) and only the routes Symphony calls
// (relay.ts), then forwards the request with the key attached.
//
//   GET|POST /functions/v1/open-brain-proxy/api/<route>?<query>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isOwner, relayPath, RELAY_METHODS } from './relay.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!RELAY_METHODS.has(req.method)) return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not signed in' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!isOwner(user?.id, Deno.env.get('VAULT_OWNER_USER_ID'))) return json({ error: 'Forbidden' }, 403)

  const url = new URL(req.url)
  const path = relayPath(url.pathname)
  if (!path) return json({ error: 'Not found' }, 404)

  const base = Deno.env.get('OPEN_BRAIN_URL')
  const key = Deno.env.get('OPEN_BRAIN_API_KEY')
  if (!base || !key) return json({ error: 'Open Brain is not configured on the server' }, 503)

  const headers: Record<string, string> = { 'X-Api-Key': key }
  const contentType = req.headers.get('Content-Type')
  if (contentType) headers['Content-Type'] = contentType

  try {
    const upstream = await fetch(`${base.replace(/\/$/, '')}${path}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? await req.arrayBuffer() : undefined,
    })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...corsHeaders, 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (err) {
    return json({ error: 'Open Brain unreachable', detail: err instanceof Error ? err.message : String(err) }, 502)
  }
})
