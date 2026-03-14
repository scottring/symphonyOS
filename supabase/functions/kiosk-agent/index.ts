import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ════════════════════════════════════════════════════════════════
// KIOSK AGENT — Scans tasks/projects, fetches proactive insights
// Currently supports: flight deals via SerpAPI Google Flights
// ════════════════════════════════════════════════════════════════

interface FlightResult {
  airline: string
  price: number
  currency: string
  departure: string
  arrival: string
  duration: string
  stops: number
  departure_airport: string
  arrival_airport: string
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

    // Auth: get the user from the JWT
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

    // Step 1: Fetch active (non-completed) tasks and their projects
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

    // Step 2: Use AI to classify which tasks are "agentable"
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
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You analyze tasks and identify ones where you can proactively fetch useful information.

Return JSON: { "agentable": [ { "task_id": "...", "type": "flight_search", "params": { "origin": "BWI", "destination": "SFO", "outbound_date": "2026-04-12", "return_date": "2026-04-16" } } ] }

Types you can identify:
- "flight_search": Task involves researching/booking flights. Extract origin (default BWI for Baltimore area), destination airport code, and approximate dates from task title, notes, or project context. If dates aren't clear, use 4 weeks from now for a weekend trip (Fri-Mon).

Only return tasks you're confident about. If no tasks are agentable, return { "agentable": [] }.
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

    // Step 3: Execute agent actions
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
        try {
          const { origin, destination, outbound_date, return_date } = item.params

          // Call SerpAPI Google Flights
          const params = new URLSearchParams({
            engine: 'google_flights',
            departure_id: origin,
            arrival_id: destination,
            outbound_date: outbound_date,
            return_date: return_date,
            currency: 'USD',
            hl: 'en',
            type: '1', // round trip
            api_key: serpApiKey,
          })

          const flightRes = await fetch(`https://serpapi.com/search?${params}`)
          const flightData = await flightRes.json()

          // Extract best flights
          const bestFlights: FlightResult[] = (flightData.best_flights || [])
            .slice(0, 3)
            .map((f: Record<string, unknown>) => {
              const legs = f.flights as Array<Record<string, unknown>> || []
              const firstLeg = legs[0] || {}
              const dep = firstLeg.departure_airport as Record<string, string> || {}
              const arr = (legs[legs.length - 1] || {}).arrival_airport as Record<string, string> || {}
              return {
                airline: (firstLeg.airline as string) || 'Unknown',
                price: f.price as number || 0,
                currency: 'USD',
                departure: dep.time || '',
                arrival: arr.time || '',
                duration: `${f.total_duration}min`,
                stops: legs.length - 1,
                departure_airport: dep.id || origin,
                arrival_airport: arr.id || destination,
              }
            })

          // Also get "other" (cheaper) flights
          const otherFlights: FlightResult[] = (flightData.other_flights || [])
            .slice(0, 3)
            .map((f: Record<string, unknown>) => {
              const legs = f.flights as Array<Record<string, unknown>> || []
              const firstLeg = legs[0] || {}
              const dep = firstLeg.departure_airport as Record<string, string> || {}
              const arr = (legs[legs.length - 1] || {}).arrival_airport as Record<string, string> || {}
              return {
                airline: (firstLeg.airline as string) || 'Unknown',
                price: f.price as number || 0,
                currency: 'USD',
                departure: dep.time || '',
                arrival: arr.time || '',
                duration: `${f.total_duration}min`,
                stops: legs.length - 1,
                departure_airport: dep.id || origin,
                arrival_airport: arr.id || destination,
              }
            })

          const allFlights = [...bestFlights, ...otherFlights]
            .filter(f => f.price > 0)
            .sort((a, b) => a.price - b.price)

          if (allFlights.length > 0) {
            const cheapest = allFlights[0]
            const expires = new Date()
            expires.setHours(expires.getHours() + 12) // expire in 12 hours

            newCards.push({
              card_type: 'flight_deal',
              title: `${origin} → ${destination} from $${cheapest.price}`,
              subtitle: `${cheapest.airline} · ${cheapest.stops === 0 ? 'Nonstop' : `${cheapest.stops} stop${cheapest.stops > 1 ? 's' : ''}`} · ${outbound_date} – ${return_date}`,
              body: {
                flights: allFlights.slice(0, 5),
                origin,
                destination,
                outbound_date,
                return_date,
                search_url: `https://www.google.com/travel/flights?q=flights+from+${origin}+to+${destination}+on+${outbound_date}+return+${return_date}`,
              },
              source_task_id: item.task_id,
              icon: '✈️',
              priority: 10,
              expires_at: expires.toISOString(),
            })
          }
        } catch (err) {
          console.error('Flight search failed:', err)
        }
      }
    }

    // Step 4: Clear old cards for this user and insert new ones
    // Delete expired or old flight cards
    await supabase
      .from('kiosk_cards')
      .delete()
      .eq('user_id', user.id)
      .eq('card_type', 'flight_deal')

    // Insert new cards
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
      message: `Processed ${agentable.length} agentable tasks, created ${newCards.length} cards`,
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
