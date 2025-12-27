import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PackingContext {
  trip: {
    destination: string
    origin: string
    startDate: string
    endDate: string
    duration_days: number
    events: Array<{
      type: string
      location?: string
      date: string
      details?: string
    }>
  }
  weather: {
    destination: {
      location: string
      temp_range: { min: number; max: number; unit: string }
      conditions_summary: string[]
      needs_rain_gear: boolean
      needs_warm_layers: boolean
      needs_sun_protection: boolean
    }
    home?: {
      location: string
      temp_range: { min: number; max: number; unit: string }
    }
  }
  travelers: Array<{
    name: string
    age_range?: string
    allergies?: string[]
    medications?: Array<{ name: string; dosage?: string }>
    dietary_restrictions?: string[]
    health_conditions?: string[]
    mobility_needs?: string
  }>
  special_needs?: string
}

type PackingNode =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'item'; text: string; checked?: boolean }

function buildPackingPrompt(context: PackingContext): string {
  const { trip, weather, travelers, special_needs } = context

  // Build weather description
  let weatherDesc = `Destination: ${weather.destination.location}\n`
  weatherDesc += `Temperature range: ${weather.destination.temp_range.min}°${weather.destination.temp_range.unit} - ${weather.destination.temp_range.max}°${weather.destination.temp_range.unit}\n`
  weatherDesc += `Conditions: ${weather.destination.conditions_summary.join(', ')}\n`
  if (weather.destination.needs_rain_gear) weatherDesc += '- Pack rain gear\n'
  if (weather.destination.needs_warm_layers) weatherDesc += '- Pack warm layers\n'
  if (weather.destination.needs_sun_protection) weatherDesc += '- Pack sun protection\n'

  // Build home climate comparison if available
  let climateComparison = ''
  if (weather.home) {
    const tempDiff = weather.destination.temp_range.min - weather.home.temp_range.min
    if (Math.abs(tempDiff) > 15) {
      climateComparison = `\nClimate comparison: Destination is ${tempDiff > 0 ? 'warmer' : 'cooler'} than home (${weather.home.temp_range.min}°${weather.home.temp_range.unit} - ${weather.home.temp_range.max}°${weather.home.temp_range.unit}). `
      climateComparison += tempDiff > 0
        ? 'Consider lighter clothing than usual at home.'
        : 'Consider warmer layers than usual at home.'
    }
  }

  // Build traveler profiles
  let travelersDesc = '\nTravelers:\n'
  for (const traveler of travelers) {
    travelersDesc += `\n- ${traveler.name}`
    if (traveler.age_range) travelersDesc += ` (${traveler.age_range})`
    if (traveler.allergies && traveler.allergies.length > 0) {
      travelersDesc += `\n  Allergies: ${traveler.allergies.join(', ')}`
    }
    if (traveler.medications && traveler.medications.length > 0) {
      travelersDesc += `\n  Medications: ${traveler.medications.map(m => `${m.name}${m.dosage ? ` (${m.dosage})` : ''}`).join(', ')}`
    }
    if (traveler.dietary_restrictions && traveler.dietary_restrictions.length > 0) {
      travelersDesc += `\n  Dietary: ${traveler.dietary_restrictions.join(', ')}`
    }
    if (traveler.health_conditions && traveler.health_conditions.length > 0) {
      travelersDesc += `\n  Health: ${traveler.health_conditions.join(', ')}`
    }
    if (traveler.mobility_needs) {
      travelersDesc += `\n  Mobility: ${traveler.mobility_needs}`
    }
  }

  // Build events description
  let eventsDesc = ''
  if (trip.events.length > 0) {
    eventsDesc = '\nPlanned events/activities:\n'
    for (const event of trip.events) {
      eventsDesc += `- ${event.type}`
      if (event.location && event.location !== trip.destination) {
        eventsDesc += ` at ${event.location}`
      }
      if (event.details) {
        eventsDesc += ` (${event.details})`
      }
      eventsDesc += '\n'
    }
  }

  const prompt = `Create a packing list for this trip with headings and checklist items.

TRIP CONTEXT:
- ${trip.destination} for ${trip.duration_days} days (${trip.startDate} to ${trip.endDate})
- Weather: ${weather.destination.temp_range.min}°${weather.destination.temp_range.unit} - ${weather.destination.temp_range.max}°${weather.destination.temp_range.unit}
- Travelers: ${travelers.map(t => `${t.name} (${t.age_range || 'adult'})`).join(', ')}
${special_needs ? `- Special: ${special_needs}` : ''}

OUTPUT FORMAT:
Return a JSON array of PackingNode objects. Each node is either:
- Heading: { "type": "heading", "level": 2-4, "text": "Heading text" }
- Item: { "type": "item", "text": "Item description", "checked": false }

STRUCTURE GUIDELINES:
- Use level 2 headings for main categories or people
- Use level 3 headings for subcategories
- Group items logically beneath headings
- Include quantities in item text (e.g., "Wool socks (6 pairs)")
- Target 20-30 total items

EXAMPLE (Montreal winter trip, 2 adults + 2 children, 6 days):
[
  {"type": "heading", "level": 2, "text": "Scott"},
  {"type": "heading", "level": 3, "text": "Clothing"},
  {"type": "item", "text": "Winter coat", "checked": false},
  {"type": "item", "text": "Snow boots", "checked": false},
  {"type": "item", "text": "Jeans (2)", "checked": false},
  {"type": "item", "text": "Sweaters (2)", "checked": false},

  {"type": "heading", "level": 2, "text": "Iris"},
  {"type": "heading", "level": 3, "text": "Clothing"},
  {"type": "item", "text": "Winter coat", "checked": false},
  {"type": "item", "text": "Snow boots", "checked": false},

  {"type": "heading", "level": 2, "text": "Ella"},
  {"type": "heading", "level": 3, "text": "Clothing"},
  {"type": "item", "text": "Winter coat", "checked": false},
  {"type": "item", "text": "Snow boots", "checked": false},

  {"type": "heading", "level": 2, "text": "Caleb"},
  {"type": "heading", "level": 3, "text": "Clothing"},
  {"type": "item", "text": "Winter coat", "checked": false},
  {"type": "item", "text": "Snow boots", "checked": false},

  {"type": "heading", "level": 2, "text": "Shared Items"},
  {"type": "heading", "level": 3, "text": "Toiletries"},
  {"type": "item", "text": "Toothbrushes (4)", "checked": false},
  {"type": "item", "text": "Toothpaste", "checked": false},
  {"type": "item", "text": "Shampoo", "checked": false},
  {"type": "item", "text": "Sunscreen SPF 30", "checked": false},

  {"type": "heading", "level": 3, "text": "Electronics"},
  {"type": "item", "text": "Phone chargers (2)", "checked": false},
  {"type": "item", "text": "Camera", "checked": false},

  {"type": "heading", "level": 3, "text": "Documents"},
  {"type": "item", "text": "Passports", "checked": false},
  {"type": "item", "text": "Hotel confirmations", "checked": false}
]

NOW generate the packing list for THIS trip. Return ONLY the JSON array, no other text.`

  return prompt
}

function parsePackingList(response: string): PackingNode[] {
  // Remove markdown code blocks if present
  let jsonStr = response.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
  }

  const parsed = JSON.parse(jsonStr)

  if (!Array.isArray(parsed)) {
    throw new Error('Response is not an array')
  }

  // Validation: Reject if too many nodes (indicates AI not following instructions)
  if (parsed.length > 100) {
    throw new Error(`Too many nodes generated (${parsed.length}). AI not following instructions.`)
  }

  // Validate and transform nodes
  const nodes: PackingNode[] = parsed.map((node: any) => {
    if (node.type === 'heading') {
      if (!node.level || !node.text) {
        throw new Error('Invalid heading node: missing level or text')
      }
      if (node.level < 1 || node.level > 4) {
        throw new Error(`Invalid heading level: ${node.level}. Must be 1-4.`)
      }
      return {
        type: 'heading',
        level: node.level as 1 | 2 | 3 | 4,
        text: node.text
      }
    } else if (node.type === 'item') {
      if (!node.text) {
        throw new Error('Invalid item node: missing text')
      }
      return {
        type: 'item',
        text: node.text,
        checked: node.checked || false
      }
    } else {
      throw new Error(`Unknown node type: ${node.type}`)
    }
  })

  // Count items (not headings)
  const itemCount = nodes.filter(n => n.type === 'item').length

  // Validation: Ensure reasonable item count
  if (itemCount < 5) {
    throw new Error(`Too few items generated (${itemCount}). Need at least 5 items.`)
  }

  if (itemCount > 50) {
    throw new Error(`Too many items generated (${itemCount}). Target is 20-30 items.`)
  }

  return nodes
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

    const context: PackingContext = await req.json()

    // Get Claude API key from environment
    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!claudeApiKey) {
      return new Response(JSON.stringify({ error: 'Claude API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build prompt
    const prompt = buildPackingPrompt(context)

    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    })

    if (!claudeResponse.ok) {
      const errorData = await claudeResponse.json()
      console.error('Claude API error:', errorData)
      return new Response(JSON.stringify({ error: 'Failed to generate packing list', details: errorData }), {
        status: claudeResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const claudeData = await claudeResponse.json()
    const responseText = claudeData.content[0].text

    // Parse the response
    const packingNodes = parsePackingList(responseText)

    return new Response(JSON.stringify({ nodes: packingNodes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error generating packing list:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
