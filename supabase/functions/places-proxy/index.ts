// @ts-nocheck
// Proxy for Google Places API (New). The browser calls THIS (our own domain via
// Supabase), not places.googleapis.com directly — because direct browser calls
// to googleapis.com fail on some devices/networks (content blockers, Private
// Relay, DNS filters): the Maps JS gRPC transport throws "Rpc failed due to xhr
// error" and even plain REST fetch throws "Load failed". Calling Google
// server-side from the edge function sidesteps all of that.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 'https://places.googleapis.com/v1'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    if (!apiKey) {
      return json({ error: 'GOOGLE_MAPS_API_KEY is not configured on the server' }, 500)
    }

    const { action, input, includedPrimaryTypes, placeId } = await req.json()

    if (action === 'autocomplete') {
      if (!input || typeof input !== 'string') {
        return json({ error: 'Missing input' }, 400)
      }
      const body: Record<string, unknown> = { input }
      if (Array.isArray(includedPrimaryTypes) && includedPrimaryTypes.length > 0) {
        body.includedPrimaryTypes = includedPrimaryTypes
      }
      const res = await fetch(`${BASE}/places:autocomplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      return json(data, res.ok ? 200 : 502)
    }

    if (action === 'details') {
      if (!placeId || typeof placeId !== 'string') {
        return json({ error: 'Missing placeId' }, 400)
      }
      const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}`, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'displayName,formattedAddress,nationalPhoneNumber',
        },
      })
      const data = await res.json()
      return json(data, res.ok ? 200 : 502)
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return json({ error: (err as Error).message || 'Places proxy failed' }, 500)
  }
})
