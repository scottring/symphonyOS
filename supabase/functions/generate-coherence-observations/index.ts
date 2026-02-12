// generate-coherence-observations — Analyzes check-in responses to produce
// system observations and drift signals based on manual domains and trends

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callOpenAI(messages: ChatMessage[], maxTokens = 2000): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: maxTokens,
      messages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${error}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

function parseJsonFromResponse(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) return JSON.parse(codeBlockMatch[1].trim())
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return JSON.parse(jsonMatch[0])
  throw new Error('No valid JSON found')
}

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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { checkinId, householdId } = await req.json()
    if (!checkinId || !householdId) {
      return new Response(JSON.stringify({ error: 'checkinId and householdId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch current check-in
    const { data: checkin, error: checkinError } = await supabaseAdmin
      .from('checkins')
      .select('*')
      .eq('id', checkinId)
      .single()

    if (checkinError || !checkin) {
      return new Response(JSON.stringify({ error: 'Check-in not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch manual domains
    const { data: manual } = await supabaseAdmin
      .from('manuals')
      .select('id, domains')
      .eq('household_id', householdId)
      .eq('type', 'household')
      .single()

    // Fetch last 4 check-ins for trends
    const { data: recentCheckins } = await supabaseAdmin
      .from('checkins')
      .select('week, responses')
      .eq('household_id', householdId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5)

    // Build trends data (skip the current one)
    const pastCheckins = (recentCheckins || [])
      .filter((c: { week: string }) => c.week !== checkin.week)
      .slice(0, 4)

    const trendSummary = pastCheckins.map((c: { week: string; responses: Record<string, { alignmentRating: number; reflectionText: string }> }) => {
      const domainRatings: Record<string, number> = {}
      for (const [domain, resp] of Object.entries(c.responses || {})) {
        domainRatings[domain] = resp.alignmentRating
      }
      return { week: c.week, ratings: domainRatings }
    })

    const DOMAIN_NAMES: Record<string, string> = {
      values: 'Values & Identity',
      communication: 'Communication',
      connection: 'Connection',
      roles: 'Roles & Responsibilities',
      organization: 'Organization & Spaces',
      adaptability: 'Adaptability',
      problemSolving: 'Problem Solving',
      resources: 'Resource Management',
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a family systems coach analyzing a weekly check-in. Your job is to identify patterns, drift signals, and provide observations.

FAMILY MANUAL DOMAINS:
${manual ? JSON.stringify(manual.domains, null, 2) : '(no manual data)'}

CURRENT CHECK-IN RESPONSES (${checkin.week}):
${JSON.stringify(checkin.responses, null, 2)}

PREVIOUS WEEKS TREND DATA:
${trendSummary.length > 0 ? JSON.stringify(trendSummary, null, 2) : '(no prior data)'}

DOMAIN NAMES: ${JSON.stringify(DOMAIN_NAMES)}

Return ONLY a valid JSON object (no markdown fences, no explanation) with this shape:
{
  "observations": [
    {
      "id": "obs1",
      "text": "A specific observation about what you notice (be warm but diagnostic)",
      "relatedManualIds": [],
      "relatedEntryIds": [],
      "dismissedByUser": false,
      "createdAt": "${new Date().toISOString()}"
    }
  ],
  "driftSignals": [
    {
      "id": "ds1",
      "description": "Specific description of the drift (connect to manual data when possible)",
      "manualId": "${manual?.id || ''}",
      "domain": "values",
      "severity": "gentle",
      "acknowledged": false,
      "createdAt": "${new Date().toISOString()}"
    }
  ]
}

RULES:
- Generate 2-4 observations that are specific and actionable
- Only generate drift signals for domains rated 2 or below, OR domains showing a downward trend over past weeks
- "gentle" severity = worth watching. "notable" severity = needs attention now
- Reference specific items from the manual domains when possible
- If reflections mention specific concerns, address those directly
- If no drift is detected, return an empty driftSignals array`,
      },
      { role: 'user', content: 'Analyze this check-in and provide observations and drift signals.' },
    ]

    const rawResponse = await callOpenAI(messages)
    let result: { observations: unknown[]; driftSignals: unknown[] }

    try {
      result = parseJsonFromResponse(rawResponse) as typeof result
    } catch {
      const retryMessages: ChatMessage[] = [
        { role: 'system', content: 'Return ONLY valid JSON. No markdown. No explanation.' },
        ...messages.slice(1),
      ]
      const retryResponse = await callOpenAI(retryMessages)
      result = parseJsonFromResponse(retryResponse) as typeof result
    }

    // Update the check-in record
    await supabaseAdmin
      .from('checkins')
      .update({
        system_observations: result.observations || [],
        drift_signals: result.driftSignals || [],
      })
      .eq('id', checkinId)

    return new Response(JSON.stringify({
      observations: result.observations || [],
      driftSignals: result.driftSignals || [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Coherence observations error:', error)
    return new Response(JSON.stringify({ error: 'Failed to generate observations' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
