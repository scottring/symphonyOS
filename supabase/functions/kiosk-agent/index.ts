import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ════════════════════════════════════════════════════════════════
// KIOSK AGENT — Scans tasks/projects, fetches proactive insights
// Supports: flight deals via SerpAPI Google Flights
// Natural language preferences → structured search → filtered results
// ════════════════════════════════════════════════════════════════

interface FlightResult {
  airline: string
  price: number
  currency: string
  departure_time: string
  arrival_time: string
  duration_min: number
  stops: number
  layover_min?: number
  departure_airport: string
  arrival_airport: string
  booking_token?: string
  booking_url?: string
  booking_post_data?: string
  book_with?: string
}

interface FlightSearchParams {
  origins: string[]
  destinations: string[]
  date_pairs: Array<{ outbound: string; return: string }>
  max_price?: number
  max_stops?: number
  max_layover_min?: number
  preferred_departure_window?: { earliest: string; latest: string }
  preferred_arrival_window?: { earliest: string; latest: string }
  return_departure_window?: { earliest: string; latest: string }
  return_arrival_window?: { earliest: string; latest: string }
  passengers?: number
  summary: string  // human-readable summary of preferences
}

interface TaskRow {
  id: string
  title: string
  notes?: string
  project_id?: string
  completed: boolean
}

interface ProjectRow {
  id: string
  name: string
  notes?: string
}

function timeToMinutes(timeStr: string): number {
  const match = timeStr.match(/(\d{1,2}):(\d{2})/)
  if (!match) return -1
  return parseInt(match[1]) * 60 + parseInt(match[2])
}

function isInTimeWindow(time: string, window?: { earliest: string; latest: string }): boolean {
  if (!window) return true
  const mins = timeToMinutes(time)
  if (mins < 0) return true
  const earliest = timeToMinutes(window.earliest)
  const latest = timeToMinutes(window.latest)
  return mins >= earliest && mins <= latest
}

// deno-lint-ignore no-explicit-any
function parseFlights(rawFlights: any[], origin: string, destination: string): FlightResult[] {
  // deno-lint-ignore no-explicit-any
  return rawFlights.map((f: any) => {
    const legs = f.flights || []
    const firstLeg = legs[0] || {}
    const lastLeg = legs[legs.length - 1] || firstLeg
    const dep = firstLeg.departure_airport || {}
    const arr = lastLeg.arrival_airport || {}

    // Calculate layover time if multi-leg
    let layoverMin = 0
    if (legs.length > 1) {
      for (let i = 0; i < legs.length - 1; i++) {
        const arrTime = legs[i].arrival_airport?.time || ''
        const depTime = legs[i + 1].departure_airport?.time || ''
        if (arrTime && depTime) {
          const diff = timeToMinutes(depTime) - timeToMinutes(arrTime)
          if (diff > 0) layoverMin += diff
        }
      }
      // Fallback: use layover info from API
      if (layoverMin === 0 && f.layovers) {
        // deno-lint-ignore no-explicit-any
        for (const lo of f.layovers) {
          layoverMin += (lo.duration || 0)
        }
      }
    }

    return {
      airline: firstLeg.airline || 'Unknown',
      price: f.price || 0,
      currency: 'USD',
      departure_time: dep.time || '',
      arrival_time: arr.time || '',
      duration_min: f.total_duration || 0,
      stops: legs.length - 1,
      layover_min: layoverMin || undefined,
      departure_airport: dep.id || origin,
      arrival_airport: arr.id || destination,
      booking_token: f.booking_token || undefined,
    }
  }).filter((f: FlightResult) => f.price > 0)
}

function filterFlights(
  flights: FlightResult[],
  params: FlightSearchParams,
  isReturn: boolean,
): FlightResult[] {
  return flights.filter(f => {
    // Price filter
    if (params.max_price && f.price > params.max_price) return false

    // Stops filter
    if (params.max_stops !== undefined && f.stops > params.max_stops) return false

    // Layover filter
    if (params.max_layover_min && f.layover_min && f.layover_min > params.max_layover_min) return false

    // Time window filters
    if (!isReturn) {
      if (!isInTimeWindow(f.departure_time, params.preferred_departure_window)) return false
      if (!isInTimeWindow(f.arrival_time, params.preferred_arrival_window)) return false
    } else {
      if (!isInTimeWindow(f.departure_time, params.return_departure_window)) return false
      if (!isInTimeWindow(f.arrival_time, params.return_arrival_window)) return false
    }

    return true
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serpApiKey = Deno.env.get('SERPAPI_KEY')
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ════════════════════════════════════════════════════════════════
    // HOME APP RULES — surface kiosk cards for Symphony Home assets
    // ════════════════════════════════════════════════════════════════
    try {
      // Rule: home.asset_added — surface 24h after needs_details asset was created
      {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
        const { data } = await supabase
          .from('assets')
          .select('id, name, space_id')
          .eq('needs_details', true)
          .lte('created_at', since)
          .gte('created_at', cutoff)
        await supabase.from('kiosk_cards').delete()
          .eq('user_id', user.id).eq('card_type', 'home.asset_added')
        if (data?.length) {
          const rows = data.map((a) => ({
            user_id: user.id,
            card_type: 'home.asset_added',
            title: `${a.name} — needs details`,
            subtitle: 'Tap your phone to fill in the rest',
            body: { asset_id: a.id },
            source_asset_id: a.id,
            icon: '📦',
            priority: 30,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          }))
          await supabase.from('kiosk_cards').insert(rows)
        }
      }

      // Rule: home.warranty_expiring — 60 days before warranty expiration
      {
        const today = new Date().toISOString().slice(0, 10)
        const inSixty = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const { data } = await supabase
          .from('assets')
          .select('id, name, warranty_expires_at')
          .gte('warranty_expires_at', today)
          .lte('warranty_expires_at', inSixty)
        await supabase.from('kiosk_cards').delete()
          .eq('user_id', user.id).eq('card_type', 'home.warranty_expiring')
        if (data?.length) {
          const rows = data.map((a) => ({
            user_id: user.id,
            card_type: 'home.warranty_expiring',
            title: `${a.name} warranty expires soon`,
            subtitle: a.warranty_expires_at,
            body: { asset_id: a.id },
            source_asset_id: a.id,
            icon: '⏰',
            priority: 40,
            expires_at: new Date(`${a.warranty_expires_at}T00:00:00Z`).toISOString(),
          }))
          await supabase.from('kiosk_cards').insert(rows)
        }
      }

      // Rule: home.needs_details — only when count > 5
      {
        const { count } = await supabase
          .from('assets')
          .select('id', { count: 'exact', head: true })
          .eq('needs_details', true)
        await supabase.from('kiosk_cards').delete()
          .eq('user_id', user.id).eq('card_type', 'home.needs_details')
        if (count && count > 5) {
          await supabase.from('kiosk_cards').insert([{
            user_id: user.id,
            card_type: 'home.needs_details',
            title: `${count} assets need details`,
            subtitle: 'Open Symphony Home to fill in',
            body: { count },
            source_asset_id: null,
            icon: '⚠️',
            priority: 25,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }])
        }
      }

      // Rule: home.recently_added — Sunday digest only
      {
        const today = new Date()
        await supabase.from('kiosk_cards').delete()
          .eq('user_id', user.id).eq('card_type', 'home.recently_added')
        if (today.getDay() === 0) {
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          const { count } = await supabase
            .from('assets')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', weekAgo)
          if (count && count > 0) {
            await supabase.from('kiosk_cards').insert([{
              user_id: user.id,
              card_type: 'home.recently_added',
              title: `${count} new asset${count === 1 ? '' : 's'} this week`,
              subtitle: 'Tap to review',
              body: { count },
              source_asset_id: null,
              icon: '🆕',
              priority: 15,
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }])
          }
        }
      }
    } catch (homeErr) {
      console.error('Home rules error:', homeErr)
      // Don't fail the entire agent run — let flight-deal logic continue
    }

    // Step 1: Fetch active tasks and projects
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, notes, project_id, completed')
      .eq('user_id', user.id)
      .eq('completed', false)
      .limit(100)

    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, notes')
      .eq('user_id', user.id)
      .in('status', ['not_started', 'in_progress'])

    if (!tasks?.length) {
      return new Response(JSON.stringify({ message: 'No active tasks', cards: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 2: AI classifies tasks with rich natural language understanding
    const projectMap = new Map<string, ProjectRow>()
    for (const p of (projects || [])) {
      projectMap.set(p.id, p)
    }

    const taskSummaries = (tasks as TaskRow[]).map(t => {
      const proj = t.project_id ? projectMap.get(t.project_id) : null
      return {
        id: t.id,
        title: t.title,
        notes: t.notes || '',
        project: proj ? proj.name : '',
        projectNotes: proj?.notes || '',
      }
    })

    if (!openAiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const classifyResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You analyze tasks and extract detailed flight search parameters from natural language descriptions.

Return JSON: {
  "agentable": [{
    "task_id": "...",
    "type": "flight_search",
    "params": {
      "origins": ["BWI", "DCA"],
      "destinations": ["SFO", "OAK"],
      "date_pairs": [
        { "outbound": "2026-03-28", "return": "2026-04-04" },
        { "outbound": "2026-03-31", "return": "2026-04-04" }
      ],
      "max_price": 400,
      "max_stops": 1,
      "max_layover_min": 120,
      "preferred_departure_window": { "earliest": "05:00", "latest": "12:00" },
      "preferred_arrival_window": { "earliest": "05:00", "latest": "21:00" },
      "return_departure_window": { "earliest": "14:00", "latest": "21:00" },
      "return_arrival_window": { "earliest": "14:00", "latest": "23:59" },
      "passengers": 4,
      "summary": "BWI/DCA to SFO/OAK, ~Mar 28-31 to Apr 2-6, nonstop preferred, budget $400 RT, daytime flights only"
    }
  }]
}

Rules:
- Extract ALL preferences from the task title and notes (which may be HTML — strip tags mentally)
- "origins": array of airport codes to search from. Default: ["BWI"] for Baltimore area
- "destinations": array of airport codes. Map city names to all nearby airports
- "date_pairs": if user says "+/- N days", generate the most promising 3-4 date combinations
- "max_price": per-person round trip budget if mentioned (null if not)
- "max_stops": 0 for nonstop-only, 1 if they say "1 stop max" or "nonstop or 1 stop". null if no preference
- "max_layover_min": max layover in minutes if they mention it. null if not
- Time windows: extract departure/arrival time preferences. Use 24h format "HH:MM". null if no preference
- "passengers": number of travelers if mentioned, null if not
- "summary": brief human-readable summary of all preferences

Only return tasks that involve flight research. If no tasks are agentable, return { "agentable": [] }.
Today's date: ${new Date().toISOString().split('T')[0]}`
          },
          {
            role: 'user',
            content: JSON.stringify(taskSummaries),
          },
        ],
      }),
    })

    const classifyData = await classifyResponse.json()
    const classified = JSON.parse(classifyData.choices[0].message.content)
    const agentable = classified.agentable || []

    if (!agentable.length) {
      return new Response(JSON.stringify({ message: 'No agentable tasks found', cards: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 3: Execute searches — run multiple origin/destination/date combos
    const newCards: Array<{
      card_type: string
      title: string
      subtitle: string
      body: Record<string, unknown>
      source_task_id: string
      icon: string
      priority: number
      expires_at: string
    }> = []

    for (const item of agentable) {
      if (item.type === 'flight_search' && serpApiKey) {
        const params = item.params as FlightSearchParams
        const allResults: Array<FlightResult & { outbound_date: string; return_date: string; route: string }> = []

        // Search all origin/destination/date combinations (limit to avoid API abuse)
        const searches: Array<{ origin: string; dest: string; outbound: string; ret: string }> = []
        for (const origin of params.origins) {
          for (const dest of params.destinations) {
            for (const dp of params.date_pairs.slice(0, 3)) {
              searches.push({ origin, dest, outbound: dp.outbound, ret: dp.return })
            }
          }
        }

        // Cap at 6 searches to stay within SerpAPI free tier
        const cappedSearches = searches.slice(0, 6)

        for (const search of cappedSearches) {
          try {
            const serpParams = new URLSearchParams({
              engine: 'google_flights',
              departure_id: search.origin,
              arrival_id: search.dest,
              outbound_date: search.outbound,
              return_date: search.ret,
              currency: 'USD',
              hl: 'en',
              type: '1',
              api_key: serpApiKey,
            })

            const flightRes = await fetch(`https://serpapi.com/search?${serpParams}`)
            const flightData = await flightRes.json()

            // Capture the exact Google Flights URL from search metadata
            const googleFlightsUrl = flightData.search_metadata?.google_flights_url || null

            const bestFlights = parseFlights(flightData.best_flights || [], search.origin, search.dest)
            const otherFlights = parseFlights(flightData.other_flights || [], search.origin, search.dest)
            const combined = [...bestFlights, ...otherFlights]

            // Apply user's filters
            const filtered = filterFlights(combined, params, false)

            for (const f of filtered) {
              allResults.push({
                ...f,
                outbound_date: search.outbound,
                return_date: search.ret,
                route: `${search.origin}→${search.dest}`,
                // Store the exact Google Flights URL for this search
                booking_url: googleFlightsUrl || undefined,
              })
            }
          } catch (err) {
            console.error(`Flight search ${search.origin}→${search.dest} failed:`, err)
          }
        }

        // Sort by price and deduplicate
        allResults.sort((a, b) => a.price - b.price)
        const topResults = allResults.slice(0, 8)

        if (topResults.length > 0) {
          const cheapest = topResults[0]
          const expires = new Date()
          expires.setHours(expires.getHours() + 12)

          // Group by route for display
          const routes = [...new Set(topResults.map(r => r.route))]
          const routeSummary = routes.join(' / ')

          newCards.push({
            card_type: 'flight_deal',
            title: `${routeSummary} from $${cheapest.price}`,
            subtitle: `${cheapest.airline} · ${cheapest.stops === 0 ? 'Nonstop' : `${cheapest.stops} stop`} · ${cheapest.outbound_date} – ${cheapest.return_date}`,
            body: {
              flights: topResults,
              preferences: params.summary,
              searches_run: cappedSearches.length,
              total_found: allResults.length,
              budget: params.max_price,
              passengers: params.passengers,
              search_url: `https://www.google.com/travel/flights?q=flights+from+${params.origins[0]}+to+${params.destinations[0]}+on+${params.date_pairs[0]?.outbound}+return+${params.date_pairs[0]?.return}`,
            },
            source_task_id: item.task_id,
            icon: '✈️',
            priority: topResults[0].price <= (params.max_price || 9999) ? 15 : 10,
            expires_at: expires.toISOString(),
          })
        } else {
          // No flights matched filters — still create a card saying so
          const expires = new Date()
          expires.setHours(expires.getHours() + 12)
          newCards.push({
            card_type: 'flight_deal',
            title: `No flights match your criteria`,
            subtitle: params.summary,
            body: {
              flights: [],
              preferences: params.summary,
              searches_run: cappedSearches.length,
              total_found: 0,
              budget: params.max_price,
              search_url: `https://www.google.com/travel/flights?q=flights+from+${params.origins[0]}+to+${params.destinations[0]}`,
            },
            source_task_id: item.task_id,
            icon: '✈️',
            priority: 5,
            expires_at: expires.toISOString(),
          })
        }
      }
    }

    // Step 4: Clear old flight cards and insert new ones
    await supabase
      .from('kiosk_cards')
      .delete()
      .eq('user_id', user.id)
      .eq('card_type', 'flight_deal')

    if (newCards.length > 0) {
      const rows = newCards.map(card => ({
        ...card,
        user_id: user.id,
      }))

      const { error: insertError } = await supabase
        .from('kiosk_cards')
        .insert(rows)

      if (insertError) {
        console.error('Failed to insert kiosk cards:', insertError)
      }
    }

    return new Response(JSON.stringify({
      message: `Processed ${agentable.length} agentable tasks, ran ${newCards.length} search groups, created ${newCards.length} cards`,
      cards: newCards,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Kiosk agent error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
