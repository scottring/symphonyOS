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

interface PackingItem {
  name: string
  category: string
  quantity?: number
  essential: boolean
  for_person?: string
}

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

  const prompt = `Create a packing list for this trip. Follow the PROCESS below step-by-step.

TRIP CONTEXT:
- ${trip.destination} for ${trip.duration_days} days (${trip.startDate} to ${trip.endDate})
- Weather: ${weather.destination.temp_range.min}°${weather.destination.temp_range.unit} - ${weather.destination.temp_range.max}°${weather.destination.temp_range.unit}
- Travelers: ${travelers.map(t => `${t.name} (${t.age_range || 'adult'})`).join(', ')}
${special_needs ? `- Special: ${special_needs}` : ''}

PROCESS (follow exactly):

STEP 1: Identify needs by category
- Clothing: Weather-appropriate items per person
- Toiletries: Shared + personal hygiene items
- Health: Medications, first aid (NO infant items for children/teens/adults)
- Electronics: Chargers, adapters
- Documents: IDs, tickets, confirmations
- Other: Activity gear, snacks

STEP 2: Generate items (TARGET: 20-30 TOTAL)
For each category, list UNIQUE items only:
- Clothing: BY PERSON (e.g., "Warm jacket for Ella", "Jeans for Scott")
- Shared items: ONE entry (e.g., "Phone chargers" with quantity: 2)
- NO DUPLICATES: "Umbrella" and "Travel umbrella" = SAME ITEM (pick one)

STEP 3: Verify before submitting
Check your list:
□ Each item appears EXACTLY ONCE
□ No infant items (diapers, bottles, strollers) for ${travelers.filter(t => t.age_range && !['infant', 'toddler'].includes(t.age_range)).map(t => t.name).join(', ')}
□ Total count: 20-30 items
□ Realistic quantities for ${trip.duration_days} days

EXAMPLE (Montreal winter trip, 2 adults + 2 children, 6 days):
[
  {"name": "Winter coat for Scott", "category": "clothing", "essential": true, "for_person": "Scott"},
  {"name": "Winter coat for Iris", "category": "clothing", "essential": true, "for_person": "Iris"},
  {"name": "Snow boots for Ella", "category": "clothing", "essential": true, "for_person": "Ella"},
  {"name": "Snow boots for Caleb", "category": "clothing", "essential": true, "for_person": "Caleb"},
  {"name": "Gloves", "category": "clothing", "quantity": 4, "essential": true},
  {"name": "Wool socks", "category": "clothing", "quantity": 12, "essential": true},
  {"name": "Sweaters", "category": "clothing", "quantity": 8, "essential": true},
  {"name": "Jeans", "category": "clothing", "quantity": 8, "essential": true},
  {"name": "Underwear", "category": "clothing", "quantity": 24, "essential": true},
  {"name": "Toothbrushes", "category": "toiletries", "quantity": 4, "essential": true},
  {"name": "Toothpaste", "category": "toiletries", "essential": true},
  {"name": "Shampoo", "category": "toiletries", "essential": true},
  {"name": "Deodorant", "category": "toiletries", "quantity": 2, "essential": true},
  {"name": "Moisturizer", "category": "toiletries", "essential": true},
  {"name": "Sunscreen SPF 30", "category": "toiletries", "essential": true},
  {"name": "First aid kit", "category": "health", "essential": true},
  {"name": "Pain relievers", "category": "health", "essential": true},
  {"name": "Phone chargers", "category": "electronics", "quantity": 2, "essential": true},
  {"name": "Camera", "category": "electronics", "essential": false},
  {"name": "Passports", "category": "documents", "essential": true},
  {"name": "Hotel confirmations", "category": "documents", "essential": true},
  {"name": "Credit cards", "category": "documents", "essential": true},
  {"name": "Snacks for kids", "category": "food_drinks", "essential": false},
  {"name": "Reusable water bottles", "category": "other", "quantity": 4, "essential": true}
]

NOW generate the packing list for THIS trip. Return ONLY the JSON array, no other text.`

  return prompt
}

function normalizeCategory(category: string): string {
  const normalized = category.toLowerCase().replace(/[^a-z_]/g, '_')

  const validCategories = [
    'clothing',
    'toiletries',
    'electronics',
    'documents',
    'health',
    'food_drinks',
    'recreation',
    'ev_equipment',
    'other'
  ]

  const categoryMap: Record<string, string> = {
    'medicine': 'health',
    'medical': 'health',
    'medication': 'health',
    'tech': 'electronics',
    'gear': 'recreation',
    'food': 'food_drinks',
    'drinks': 'food_drinks',
    'snacks': 'food_drinks'
  }

  const mapped = categoryMap[normalized] || normalized
  return validCategories.includes(mapped) ? mapped : 'other'
}

function parsePackingList(response: string): PackingItem[] {
  // Remove markdown code blocks if present
  let jsonStr = response.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
  }

  const parsed = JSON.parse(jsonStr)

  if (!Array.isArray(parsed)) {
    throw new Error('Response is not an array')
  }

  // Validation: Reject if too many items (indicates AI not following instructions)
  if (parsed.length > 50) {
    throw new Error(`Too many items generated (${parsed.length}). AI not following quality over quantity instruction.`)
  }

  const items = parsed.map((item: any) => ({
    name: item.name,
    category: normalizeCategory(item.category),
    quantity: item.quantity || undefined,
    essential: item.essential !== false,
    for_person: item.for_person || undefined
  }))

  // Aggressive deduplication to catch variations
  // Normalize item names by removing common words and checking for similarity
  const normalizeForDedup = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      // Remove common descriptors that don't change the core item
      .replace(/\b(travel|reusable|portable|small|large|kids?|adults?|for\s+\w+)\b/gi, '')
      // Remove parentheticals like "(2)" or "(for Scott)"
      .replace(/\([^)]*\)/g, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  }

  const seen = new Set<string>()
  const seenNormalized = new Set<string>()
  const uniqueItems: PackingItem[] = []

  for (const item of items) {
    const exactKey = item.name.toLowerCase().trim()
    const normalizedKey = normalizeForDedup(item.name)

    // Skip if we've seen the exact name OR a normalized version of it
    if (seen.has(exactKey) || (normalizedKey && seenNormalized.has(normalizedKey))) {
      console.log(`Skipping duplicate: "${item.name}" (normalized: "${normalizedKey}")`)
      continue
    }

    seen.add(exactKey)
    if (normalizedKey) {
      seenNormalized.add(normalizedKey)
    }
    uniqueItems.push(item)
  }

  // Validation: Reject if we found too many duplicates
  const duplicateCount = items.length - uniqueItems.length
  const duplicateRate = duplicateCount / items.length

  if (duplicateRate > 0.3) {
    throw new Error(`Too many duplicates detected (${duplicateCount}/${items.length}). Response quality too low.`)
  }

  // Validation: Check for age-inappropriate items
  const inappropriateInfantItems = [
    'diaper', 'baby wipe', 'stroller', 'car seat', 'formula', 'baby bottle', 'sippy cup', 'pull-up', 'pacifier', 'onesie'
  ]

  const hasInappropriateItems = uniqueItems.some(item => {
    const itemLower = item.name.toLowerCase()
    return inappropriateInfantItems.some(inappropriate => {
      // More specific matching to avoid false positives
      // For "baby bottle" we need the full phrase, not just "bottle"
      const needsWordBoundary = inappropriate === 'baby bottle'

      // Check if the item contains an infant-specific term
      const matches = needsWordBoundary
        ? itemLower.includes(inappropriate)
        : new RegExp(`\\b${inappropriate}s?\\b`).test(itemLower) // Word boundary check with optional plural

      if (matches) {
        // Unless it's specifically for an infant/toddler (check for_person field)
        const isForInfantOrToddler = item.for_person &&
          (item.for_person.toLowerCase().includes('infant') ||
           item.for_person.toLowerCase().includes('toddler') ||
           item.for_person.toLowerCase().includes('baby'))
        return !isForInfantOrToddler
      }
      return false
    })
  })

  if (hasInappropriateItems) {
    console.error('Inappropriate infant items detected in response')
    throw new Error('Response contains age-inappropriate items (infant items for older children/adults)')
  }

  return uniqueItems
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
    const packingItems = parsePackingList(responseText)

    return new Response(JSON.stringify({ items: packingItems }), {
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
