// LIST-CONTACTS — proxies the kid-phone display feed to the authenticated wall.
// Keeps the shared secret server-side; returns name/photo/favorite/enabled only.
//
// Auth: the caller's Supabase JWT (Authorization: Bearer). No body required.
// No-op-safe: returns 503 until KIDPHONE_LIST_CONTACTS_URL + KIDPHONE_CALL_SECRET
// are configured.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseContactsResponse } from './lib/validate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'missing bearer token' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401)

  const listUrl = Deno.env.get('KIDPHONE_LIST_CONTACTS_URL') ?? ''
  const secret = Deno.env.get('KIDPHONE_CALL_SECRET') ?? ''
  if (!listUrl || !secret) return jsonResponse({ error: 'telephony not configured' }, 503)

  try {
    const res = await fetch(listUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kidphone-secret': secret },
      body: '{}',
    })
    if (!res.ok) return jsonResponse({ error: `bridge error ${res.status}` }, 502)
    const raw = await res.json().catch(() => ({}))
    return jsonResponse(parseContactsResponse(raw))
  } catch (e) {
    return jsonResponse({ error: `bridge unreachable: ${e instanceof Error ? e.message : 'unknown'}` }, 502)
  }
})
