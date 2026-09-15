// @ts-nocheck
// Proxy for Google Places API (New) + Directions. The browser calls THIS (our own domain via
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

    const {
      action,
      input,
      includedPrimaryTypes,
      placeId,
      origin,
      originPlaceId,
      destination,
      destinationPlaceId,
      travelMode,
    } = await req.json()

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

    if (action === 'route') {
      // Travel time for an item's address.
      //
      // Uses the classic Directions API, NOT the newer Routes API: Routes
      // (routes.googleapis.com) and Distance Matrix are both blocked on this
      // Cloud project's key, while Directions is enabled — it is what the
      // detail panel's DirectionsBuilder already runs on. If Routes is ever
      // enabled, this is the one place to switch.
      //
      // No departure time is sent, so the answer is traffic-free: "how far
      // away is this place", not a countdown. That keeps it cacheable for a
      // month, so a recurring address costs one call rather than one per render.
      const waypoint = (address?: string, id?: string) =>
        id ? `place_id:${id}` : (address ?? '')

      const from = waypoint(origin, originPlaceId)
      const to = waypoint(destination, destinationPlaceId)
      if (!from) return json({ error: 'Missing origin' }, 400)
      if (!to) return json({ error: 'Missing destination' }, 400)

      const MODES: Record<string, string> = {
        driving: 'driving',
        walking: 'walking',
        transit: 'transit',
        bicycling: 'bicycling',
      }
      const mode = MODES[travelMode] ?? 'driving'

      const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
      url.searchParams.set('origin', from)
      url.searchParams.set('destination', to)
      url.searchParams.set('mode', mode)
      url.searchParams.set('key', apiKey)

      const res = await fetch(url.toString())
      const data = await res.json()

      if (data?.status !== 'OK') {
        // ZERO_RESULTS is a legitimate answer (an island, a bad address), not
        // an outage — either way the client just renders no chip.
        const status = data?.status === 'ZERO_RESULTS' ? 404 : 502
        return json({ error: data?.error_message || data?.status || 'Route lookup failed' }, status)
      }

      const legs = data?.routes?.[0]?.legs ?? []
      if (legs.length === 0) return json({ error: 'No route found' }, 404)

      const durationSeconds = legs.reduce(
        (sum: number, leg: { duration?: { value?: number } }) => sum + (leg.duration?.value ?? 0),
        0,
      )
      const distanceMeters = legs.reduce(
        (sum: number, leg: { distance?: { value?: number } }) => sum + (leg.distance?.value ?? 0),
        0,
      )
      if (!durationSeconds) return json({ error: 'Route had no duration' }, 502)

      return json({ durationSeconds, distanceMeters })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return json({ error: (err as Error).message || 'Places proxy failed' }, 500)
  }
})
