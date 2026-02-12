import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No auth header')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiKey = Deno.env.get('OPENAI_API_KEY')!

    // Auth check
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) throw new Error('Unauthorized')

    // Admin client for writes
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { householdId, manualId, year, focusDomains } = await req.json()
    if (!householdId || !manualId) throw new Error('Missing householdId or manualId')

    const targetYear = year || new Date().getFullYear()

    // Fetch manual
    const { data: manual, error: manualError } = await adminClient
      .from('manuals')
      .select('domains')
      .eq('id', manualId)
      .single()

    if (manualError || !manual) throw new Error('Manual not found')

    const domains = manual.domains

    // Build a summary of the manual for GPT — focus on challenges, pain points, goals
    const domainSummaries: string[] = []
    const domainIds = focusDomains?.length > 0
      ? focusDomains
      : Object.keys(DOMAIN_NAMES)

    for (const domainId of domainIds) {
      const data = domains[domainId]
      if (!data) continue

      const parts: string[] = [`## ${DOMAIN_NAMES[domainId]}`]

      // Extract challenges, pain points, goals from domain data
      if (data.challenges?.length) parts.push(`Challenges: ${data.challenges.join('; ')}`)
      if (data.painPoints?.length) parts.push(`Pain Points: ${data.painPoints.join('; ')}`)
      if (data.goals?.length) parts.push(`Goals: ${data.goals.join('; ')}`)
      if (data.strengths?.length) parts.push(`Strengths: ${data.strengths.join('; ')}`)
      if (data.stressors?.length) parts.push(`Stressors: ${data.stressors.join('; ')}`)
      if (data.tensions?.length) parts.push(`Tensions: ${data.tensions.join('; ')}`)
      if (data.conflictPatterns?.length) parts.push(`Conflict Patterns: ${data.conflictPatterns.join('; ')}`)
      if (data.values?.length) {
        const valueNames = data.values.map((v: { name: string }) => v.name).join(', ')
        parts.push(`Core Values: ${valueNames}`)
      }
      if (data.nonNegotiables?.length) parts.push(`Non-Negotiables: ${data.nonNegotiables.join('; ')}`)

      if (parts.length > 1) domainSummaries.push(parts.join('\n'))
    }

    // Fetch existing goals to avoid duplication
    const { data: existingGoals } = await adminClient
      .from('goals')
      .select('name')
      .eq('user_id', user.id)
      .eq('year', targetYear)

    const existingNames = (existingGoals || []).map((g: { name: string }) => g.name.toLowerCase())

    const currentQuarter = (() => {
      const month = new Date().getMonth()
      if (month < 3) return 'Q1'
      if (month < 6) return 'Q2'
      if (month < 9) return 'Q3'
      return 'Q4'
    })()

    // Generate cascading goals via GPT-4o
    const systemPrompt = `You are an expert family systems consultant generating a strategic annual plan from a family's operating manual.

Your job is to identify the highest-leverage improvement areas and create cascading goals:
- Year-level goal (the big outcome)
- Quarterly actions (specific, measurable steps for each quarter)

Rules:
1. Generate 3-5 goals, each tied to a specific domain from the manual.
2. Focus on challenges, pain points, and stated goals — not strengths.
3. Each goal should be concrete and achievable within a year.
4. Quarterly actions should build on each other (Q1 foundations enable Q2 progress, etc.).
5. Current quarter is ${currentQuarter} — make ${currentQuarter} actions immediately actionable.
6. Actions should be specific (not "improve communication" but "implement a 10-minute daily check-in after dinner").
7. Each goal needs a clear "area" name (a life area category, e.g. "Family Communication", "Home Organization").

${existingNames.length > 0 ? `\nThe family already has these goals (avoid duplicates): ${existingNames.join(', ')}` : ''}

Return ONLY valid JSON (no markdown fences):
{
  "goals": [
    {
      "areaName": "string — the life area this belongs to (e.g. 'Family Communication')",
      "goalName": "string — the annual goal",
      "domain": "string — the domainId this maps to",
      "rationale": "string — brief why this matters based on their manual",
      "notes": "string — context and motivation for this goal",
      "actions": [
        {
          "quarter": "Q1",
          "description": "string — specific action for this quarter"
        }
      ]
    }
  ]
}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Here is the family's manual data:\n\n${domainSummaries.join('\n\n')}\n\nGenerate 3-5 cascading goals for ${targetYear}.`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`OpenAI error: ${errText}`)
    }

    const completion = await response.json()
    const content = completion.choices?.[0]?.message?.content || '{}'

    // Parse — strip markdown fences if present
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    let parsed: { goals: Array<{
      areaName: string
      goalName: string
      domain: string
      rationale: string
      notes: string
      actions: Array<{ quarter: string; description: string }>
    }> }

    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new Error('Failed to parse AI response as JSON')
    }

    if (!parsed.goals?.length) {
      return new Response(JSON.stringify({ goals: [], message: 'No goals generated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Return the generated goals for client-side review before import
    return new Response(JSON.stringify({
      goals: parsed.goals,
      year: targetYear,
      currentQuarter,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
