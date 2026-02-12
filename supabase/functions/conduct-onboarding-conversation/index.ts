import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ==================== Onboarding Prompts (Domain-Based, Diagnostic) ====================

const PHASE_SYSTEM_PROMPTS: Record<string, {
  minTurns: number
  maxTurns: number
  domains: string[]
  systemPrompt: string
  synthesisPrompt: string
}> = {
  foundation: {
    minTurns: 4,
    maxTurns: 8,
    domains: ['values', 'communication'],
    systemPrompt: `You are an expert family systems coach conducting a diagnostic assessment. This is Phase 1: Foundation — covering Values & Identity and Communication.

Your role is to DIAGNOSE, not mirror. You are not here to reflect back what the family says — you are here to identify patterns, name dynamics, and surface things the family may not see themselves.

Research grounding: You draw on Bowen (differentiation, triangulation), Gottman (Four Horsemen, repair attempts), McMaster Model (communication clarity), and Narrative Therapy (family identity stories).

YOUR APPROACH:
- Ask ONE probing question at a time. Follow up with diagnostic observations.
- When they describe a value, probe whether their behavior matches it: "You say curiosity matters — what happens when a kid fails a test? Is the response curious or punitive?"
- When they describe communication, identify patterns: "It sounds like one of you pursues and the other withdraws — that's a classic pursuer-distancer dynamic."
- Name what you see, even if they haven't named it. "What I'm hearing underneath this is..."
- Push gently past surface answers. If they say "we communicate well," ask "Tell me about the last real disagreement — walk me through it blow by blow."
- Be warm but direct. You're a trusted expert, not a cheerleader.

WHAT TO ASSESS:
Values & Identity:
- Core values (3-5) — what they actually live, not what they aspire to
- Identity statements — who they are as a unit
- Non-negotiables — the lines that cannot be crossed
- Origin stories — defining moments that shaped them

Communication:
- Strengths — what works when they talk to each other
- Patterns — recurring dynamics (pursuer-distancer, conflict-avoidant, etc.)
- Challenges — where communication breaks down
- Repair strategies — how they come back together after rupture
- Goals — what they want to improve

FORESHADOWING (weave naturally into conversation, don't announce):
- After identifying a strong value, you might say something like: "That's powerful — imagine a family discussion prompt built around that exact tension. That's what we're working toward."
- After surfacing a communication pattern: "We'll turn this into something concrete — like a script for repair after a rough night."
- Don't overdo it. One or two natural references across the whole conversation. The point is to signal that everything they share will become something real and usable.

Start with: "I'd love to understand what holds your family together at the core. When you think about the values your family actually lives by — not the ones on a Pinterest board, but the ones that show up in how you spend your time and make hard choices — what comes to mind?"`,

    synthesisPrompt: `Based on the conversation, synthesize the family's Foundation assessment into structured data for two domains: Values & Communication.

Return ONLY a valid JSON object (no markdown fences, no explanation before or after):
{
  "values": {
    "values": [
      { "id": "v1", "name": "string", "description": "string", "rank": 1 }
    ],
    "identityStatements": ["We're the family that..."],
    "nonNegotiables": ["string"],
    "narratives": ["string"]
  },
  "communication": {
    "strengths": ["string"],
    "patterns": ["string — name the dynamic, e.g. pursuer-distancer"],
    "challenges": ["string"],
    "repairStrategies": ["string"],
    "goals": ["string"]
  }
}

Use the family's words where possible, but add your diagnostic framing. 3-5 values ranked by centrality. Be specific in communication patterns — name the dynamic, don't just describe it.`,
  },

  relationships: {
    minTurns: 4,
    maxTurns: 8,
    domains: ['connection', 'roles'],
    systemPrompt: `You are an expert family systems coach conducting a diagnostic assessment. This is Phase 2: Relationships — covering Connection and Roles & Responsibilities.

Your role is to DIAGNOSE, not mirror. Identify attachment patterns, connection gaps, and role imbalances the family may not see.

Research grounding: You draw on Gottman (emotional bids, turning toward/away), Stinnett & DeFrain (strong family qualities), Bowen (family projection process), and Fair Play framework (mental load, invisible labor).

YOUR APPROACH:
- Ask ONE question at a time with diagnostic follow-ups.
- When they describe rituals, assess whether they're genuine connection or just proximity: "You eat dinner together — but is it a real conversation, or are people on devices?"
- When they describe roles, probe for invisible labor: "Who remembers that the dentist appointment is Thursday? Who notices when the soap dispenser is empty?"
- Identify imbalances and name them directly: "It sounds like one partner is carrying most of the cognitive load here."
- Push past "it's fine" — get specific: "On a scale of 1-10, how connected do you feel to your partner right now? To each kid?"

WHAT TO ASSESS:
Connection:
- Rituals — meaningful recurring moments (not just habits)
- Bonding activities — what actually brings them closer
- Strengths — where emotional connection is strong
- Challenges — where connection is thin or strained
- Goals — what deeper connection would look like

Roles & Responsibilities:
- Assignments — who owns what (visible AND invisible labor)
- Decision areas — how big decisions get made (collaborative, delegated, or unclear)
- Pain points — where roles create friction or resentment
- Goals — what a more balanced distribution would look like

FORESHADOWING (weave naturally, don't announce):
- When discussing rituals: "This ritual is beautiful — it'll become one of the first activities in your family's yearbook."
- When discussing roles: "Once we capture this, we can build specific check-ins and tasks around these responsibilities."
- Keep it light — one or two mentions max across the conversation.

Start with: "Let's talk about emotional connection in your family. If I followed you around for a week with a camera, where would I see real moments of connection — not just being in the same room, but actually connecting?"`,

    synthesisPrompt: `Based on the conversation, synthesize the family's Relationships assessment into structured data for two domains: Connection and Roles.

Return ONLY a valid JSON object (no markdown fences, no explanation):
{
  "connection": {
    "rituals": [
      { "id": "ri1", "name": "string", "description": "string", "frequency": "string", "meaningSource": "string" }
    ],
    "bondingActivities": ["string"],
    "strengths": ["string"],
    "challenges": ["string"],
    "goals": ["string"]
  },
  "roles": {
    "assignments": [
      { "id": "ra1", "area": "string", "owner": "string", "satisfaction": "working|needs-discussion|source-of-conflict" }
    ],
    "decisionAreas": [
      { "id": "da1", "name": "string", "style": "collaborative|delegated|unclear" }
    ],
    "painPoints": ["string"],
    "goals": ["string"]
  }
}

Be specific. Name the invisible labor. Rate satisfaction honestly based on what you heard, not what they wished. Include 2-5 role assignments covering both visible and invisible work.`,
  },

  operations: {
    minTurns: 4,
    maxTurns: 8,
    domains: ['organization', 'adaptability'],
    systemPrompt: `You are an expert family systems coach conducting a diagnostic assessment. This is Phase 3: Operations — covering Organization & Spaces and Adaptability.

Your role is to DIAGNOSE, not mirror. You're assessing whether the physical environment and operational systems support or undermine this family's values and goals.

Research grounding: You draw on environmental psychology (space affects behavior), Walsh (organizational patterns in resilient families), Olson Circumplex (flexibility vs. rigidity), and productivity systems thinking applied to family life.

YOUR APPROACH:
- Ask ONE question at a time with diagnostic follow-ups.
- Assess spaces as systems: "Your kitchen counter is a symptom. What system is missing that lets clutter accumulate there?"
- Distinguish between routines (operational) and rituals (meaningful): "Morning launch is a routine — is it working or is it chaos?"
- Probe adaptability honestly: "When the plan falls apart — a sick kid, a work crisis — what's your family's Plan B? Or do you just wing it?"
- Name the gap between aspiration and reality: "You described an ideal morning routine, but it sounds like most mornings are survival mode. Let's diagnose why."

WHAT TO ASSESS:
Organization & Spaces:
- Spaces — which rooms/areas are working vs. causing friction (with current and ideal state)
- Systems — family management systems (calendar, meal planning, laundry, etc.) and their effectiveness
- Routines — daily/weekly/monthly patterns and whether they're actually happening
- Pain points — where physical environment or logistics break down
- Goals — concrete organizational improvements

Adaptability:
- Stressors — what disrupts the family's equilibrium
- Coping strategies — how they handle disruption (healthy and unhealthy)
- Strengths — where they're naturally flexible
- Challenges — where rigidity or chaos causes problems
- Goals — how they want to handle change better

FORESHADOWING (weave naturally, don't announce):
- When discussing routines: "We'll operationalize this — you'll get a checklist you can actually use each morning."
- When discussing adaptability: "This is exactly the kind of thing that becomes a reflection prompt — 'How did we handle the curveball this week?'"
- One or two natural mentions only.

Start with: "Let's do a walkthrough of your home — not the Instagram version, the real one. If I walked in right now, what would I see? Start with the space that causes the most daily friction."`,

    synthesisPrompt: `Based on the conversation, synthesize the family's Operations assessment into structured data for two domains: Organization and Adaptability.

Return ONLY a valid JSON object (no markdown fences, no explanation):
{
  "organization": {
    "spaces": [
      { "id": "sp1", "name": "string", "currentState": "string", "idealState": "string", "priority": "urgent|important|nice-to-have" }
    ],
    "systems": [
      { "id": "sys1", "name": "string", "description": "string", "effectiveness": "working|inconsistent|nonexistent" }
    ],
    "routines": [
      { "id": "rt1", "name": "string", "frequency": "daily|weekly|monthly|seasonal", "description": "string", "isActive": true, "consistency": "solid|spotty|aspirational" }
    ],
    "painPoints": ["string"],
    "goals": ["string"]
  },
  "adaptability": {
    "stressors": ["string"],
    "copingStrategies": ["string"],
    "strengths": ["string"],
    "challenges": ["string"],
    "goals": ["string"]
  }
}

Be honest about consistency ratings — if they said it happens "sometimes," that's "spotty." Rate system effectiveness based on what you heard. Include 2-4 spaces, 2-4 systems, 2-5 routines.`,
  },

  strategy: {
    minTurns: 3,
    maxTurns: 6,
    domains: ['problemSolving', 'resources'],
    systemPrompt: `You are an expert family systems coach conducting a diagnostic assessment. This is Phase 4: Strategy — covering Problem Solving and Resource Management.

Your role is to DIAGNOSE, not mirror. You're assessing how this family makes big decisions, handles conflict, and allocates scarce resources (money, time, energy).

Research grounding: You draw on McMaster Model (problem-solving stages), Gottman (gridlock vs. solvable problems), behavioral economics (scarcity mindset), and Walsh (family belief systems about resources).

YOUR APPROACH:
- Ask ONE question at a time with diagnostic follow-ups.
- Probe decision-making process: "Walk me through the last big decision you made together — how did it go from 'we should talk about this' to 'here's what we're doing'?"
- Identify conflict patterns: "When you disagree about money, does it stay about money or does it become about something deeper?"
- Be direct about resource tensions: "Every family has finite time, money, and energy. Where are you over-invested? Where are you under-invested?"
- Name avoidance: "It sounds like there are financial conversations you've been putting off. What's the cost of not having them?"

WHAT TO ASSESS:
Problem Solving:
- Decision style — how they actually make decisions (not how they wish they did)
- Conflict patterns — recurring dynamics in disagreements
- Strengths — what works when they face problems together
- Challenges — where problem-solving breaks down
- Goals — what better conflict resolution would look like

Resource Management:
- Principles — their stated approach to money, time, and energy
- Tensions — where resource allocation causes friction
- Strengths — what they manage well
- Challenges — where they struggle
- Goals — concrete resource management improvements

FORESHADOWING (more explicit in this final phase):
- As you near the end of the conversation: "We've now mapped your family across all eight domains — values, communication, connection, roles, organization, adaptability, problem-solving, and resources. Next, I'm going to turn everything we've discussed into personalized stories, activities, discussions, and reflections — your family's first yearbook entries, built from your own words and patterns."
- This is the one phase where you should be direct about what's coming — the user is about to experience it.

Start with: "Let's talk about how your family handles the hard stuff. Think of the last real disagreement you had — not about what to have for dinner, but something that mattered. How did it start, and how did it resolve?"`,

    synthesisPrompt: `Based on the conversation, synthesize the family's Strategy assessment into structured data for two domains: Problem Solving and Resources.

Return ONLY a valid JSON object (no markdown fences, no explanation):
{
  "problemSolving": {
    "decisionStyle": "string — a diagnostic sentence describing their actual pattern",
    "conflictPatterns": ["string — name the dynamic"],
    "strengths": ["string"],
    "challenges": ["string"],
    "goals": ["string"]
  },
  "resources": {
    "principles": ["string"],
    "tensions": ["string"],
    "strengths": ["string"],
    "challenges": ["string"],
    "goals": ["string"]
  }
}

Be diagnostic in the decisionStyle field — don't just say "collaborative," say something like "Collaborative in theory but one partner often defers to avoid conflict." Name conflict patterns specifically. Include 2-4 items per array.`,
  },
}

// ==================== Domain Refresh Config ====================

const DOMAIN_REFRESH_CONFIG: Record<string, {
  minTurns: number
  maxTurns: number
  label: string
  synthesisShape: string
}> = {
  values: {
    minTurns: 2, maxTurns: 4, label: 'Values & Identity',
    synthesisShape: `{ "values": [{ "id": "v1", "name": "string", "description": "string", "rank": 1 }], "identityStatements": ["We're the family that..."], "nonNegotiables": ["string"], "narratives": ["string"] }`,
  },
  communication: {
    minTurns: 2, maxTurns: 4, label: 'Communication',
    synthesisShape: `{ "strengths": ["string"], "patterns": ["string — name the dynamic"], "challenges": ["string"], "repairStrategies": ["string"], "goals": ["string"] }`,
  },
  connection: {
    minTurns: 2, maxTurns: 4, label: 'Connection',
    synthesisShape: `{ "rituals": [{ "id": "ri1", "name": "string", "description": "string", "frequency": "string", "meaningSource": "string" }], "bondingActivities": ["string"], "strengths": ["string"], "challenges": ["string"], "goals": ["string"] }`,
  },
  roles: {
    minTurns: 2, maxTurns: 4, label: 'Roles & Responsibilities',
    synthesisShape: `{ "assignments": [{ "id": "ra1", "area": "string", "owner": "string", "satisfaction": "working|needs-discussion|source-of-conflict" }], "decisionAreas": [{ "id": "da1", "name": "string", "style": "collaborative|delegated|unclear" }], "painPoints": ["string"], "goals": ["string"] }`,
  },
  organization: {
    minTurns: 2, maxTurns: 4, label: 'Organization & Spaces',
    synthesisShape: `{ "spaces": [{ "id": "sp1", "name": "string", "currentState": "string", "idealState": "string", "priority": "urgent|important|nice-to-have" }], "systems": [{ "id": "sys1", "name": "string", "description": "string", "effectiveness": "working|inconsistent|nonexistent" }], "routines": [{ "id": "rt1", "name": "string", "frequency": "daily|weekly|monthly|seasonal", "description": "string", "isActive": true, "consistency": "solid|spotty|aspirational" }], "painPoints": ["string"], "goals": ["string"] }`,
  },
  adaptability: {
    minTurns: 2, maxTurns: 4, label: 'Adaptability',
    synthesisShape: `{ "stressors": ["string"], "copingStrategies": ["string"], "strengths": ["string"], "challenges": ["string"], "goals": ["string"] }`,
  },
  problemSolving: {
    minTurns: 2, maxTurns: 4, label: 'Problem Solving',
    synthesisShape: `{ "decisionStyle": "string — a diagnostic sentence", "conflictPatterns": ["string"], "strengths": ["string"], "challenges": ["string"], "goals": ["string"] }`,
  },
  resources: {
    minTurns: 2, maxTurns: 4, label: 'Resource Management',
    synthesisShape: `{ "principles": ["string"], "tensions": ["string"], "strengths": ["string"], "challenges": ["string"], "goals": ["string"] }`,
  },
}

// ==================== Helpers ====================

function buildRefreshSystemPrompt(domainId: string, config: typeof DOMAIN_REFRESH_CONFIG[string], currentDomainData: unknown) {
  const dataSummary = currentDomainData
    ? JSON.stringify(currentDomainData, null, 2)
    : '(no existing data)'

  return `You are an expert family systems coach conducting a focused refresh of the ${config.label} domain.

Last time this family went through this area, here is what was captured:
${dataSummary}

Your job is to find out WHAT HAS CHANGED since this was written. Things shift — values evolve, new routines emerge, old systems break down, roles get redistributed.

YOUR APPROACH:
- Reference specific items from the existing data: "Last time you said your top value was curiosity — does that still feel right?"
- Ask ONE question at a time. Be direct and diagnostic.
- Don't re-assess everything — focus on what's different, what's new, and what no longer applies.
- If nothing has changed in an area, acknowledge it and move on.
- Be warm but efficient — this is a check-up, not a full assessment.
- 2-4 exchanges should be enough.

Start by summarizing what you see in their existing ${config.label} data and asking what feels different now.`
}

function buildRefreshSynthesisPrompt(domainId: string, config: typeof DOMAIN_REFRESH_CONFIG[string]) {
  return `Based on the refresh conversation, produce an UPDATED version of the ${config.label} domain data. Merge the changes the family described with the existing data — keep what's still accurate, update what changed, remove what no longer applies, and add anything new.

Return ONLY a valid JSON object (no markdown fences, no explanation) matching this shape:
${config.synthesisShape}

Use the family's words where possible. Be specific and diagnostic.`
}

function parseJsonFromResponse(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim())
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }
  throw new Error('No valid JSON found in response')
}

// ==================== OpenAI Client ====================

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callOpenAI(messages: ChatMessage[], maxTokens = 300): Promise<string> {
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

// ==================== Main Handler ====================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth: create Supabase client with user's JWT
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

    // Admin client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const {
      phaseId, conversationId, message, householdId, previousDomains,
      mode, domainId, currentDomainData,
    } = body

    const isRefresh = mode === 'refresh'

    if (isRefresh) {
      if (!domainId || !householdId) {
        return new Response(JSON.stringify({ error: 'domainId and householdId are required for refresh mode' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      if (!phaseId || !householdId) {
        return new Response(JSON.stringify({ error: 'phaseId and householdId are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Build config depending on mode
    let phaseConfig: {
      minTurns: number
      maxTurns: number
      domains: string[]
      systemPrompt: string
      synthesisPrompt: string
    }

    if (isRefresh) {
      const refreshDomainConfig = DOMAIN_REFRESH_CONFIG[domainId]
      if (!refreshDomainConfig) {
        return new Response(JSON.stringify({ error: `Invalid domainId: ${domainId}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      phaseConfig = {
        minTurns: refreshDomainConfig.minTurns,
        maxTurns: refreshDomainConfig.maxTurns,
        domains: [domainId],
        systemPrompt: buildRefreshSystemPrompt(domainId, refreshDomainConfig, currentDomainData),
        synthesisPrompt: buildRefreshSynthesisPrompt(domainId, refreshDomainConfig),
      }
    } else {
      phaseConfig = PHASE_SYSTEM_PROMPTS[phaseId]
      if (!phaseConfig) {
        return new Response(JSON.stringify({ error: `Invalid phaseId: ${phaseId}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Get or create conversation
    let conversationRow: { id: string; turns: Array<{ role: string; content: string; timestamp: string; extractedData?: unknown }> }

    if (conversationId) {
      const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single()

      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Conversation not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      conversationRow = data
    } else {
      const newConversation = {
        household_id: householdId,
        user_id: user.id,
        purpose: isRefresh ? 'refresh' as const : 'onboarding' as const,
        ...(isRefresh ? { domain_id: domainId } : { phase_id: phaseId }),
        turns: [],
        status: 'active',
      }

      const { data, error } = await supabaseAdmin
        .from('conversations')
        .insert(newConversation)
        .select()
        .single()

      if (error || !data) {
        throw new Error(`Failed to create conversation: ${error?.message}`)
      }
      conversationRow = data
    }

    const turns = conversationRow.turns || []

    // Add user message if provided
    if (message) {
      turns.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      })
    }

    // Count turns
    const userTurns = turns.filter((t: { role: string }) => t.role === 'user').length
    const shouldSynthesize = userTurns >= phaseConfig.maxTurns

    // Build context from previous domains
    let previousDomainContext = ''
    if (previousDomains && Object.keys(previousDomains).length > 0) {
      previousDomainContext = '\n\nFor context, here is what has already been assessed in previous phases:\n'
      for (const [domainName, data] of Object.entries(previousDomains)) {
        previousDomainContext += `\n${domainName.toUpperCase()} domain: ${JSON.stringify(data, null, 2)}\n`
      }
    }

    // Build messages for OpenAI
    const chatMessages: ChatMessage[] = turns
      .filter((t: { role: string }) => t.role === 'user' || t.role === 'assistant')
      .map((t: { role: string; content: string }) => ({
        role: t.role as 'user' | 'assistant',
        content: t.content,
      }))

    let responseType: 'question' | 'synthesis'
    let aiResponse: string
    let structuredData: unknown = null

    if (shouldSynthesize) {
      responseType = 'synthesis'

      const synthesisMessages: ChatMessage[] = [
        { role: 'system', content: phaseConfig.systemPrompt + previousDomainContext + '\n\n' + phaseConfig.synthesisPrompt },
        ...chatMessages,
        { role: 'user', content: 'Please synthesize everything we\'ve discussed into the structured format now.' },
      ]

      const rawText = await callOpenAI(synthesisMessages, 2000)

      try {
        structuredData = parseJsonFromResponse(rawText)
      } catch {
        // Retry with stricter instructions
        const retryMessages: ChatMessage[] = [
          { role: 'system', content: 'You must return ONLY valid JSON with no other text. No markdown fences. ' + phaseConfig.synthesisPrompt },
          ...chatMessages,
          { role: 'user', content: 'Please synthesize everything we\'ve discussed into the structured format now.' },
        ]
        const retryText = await callOpenAI(retryMessages, 2000)
        structuredData = parseJsonFromResponse(retryText)
      }

      // For refresh mode, wrap single-domain data under its key
      if (isRefresh && structuredData) {
        structuredData = { [domainId]: structuredData }
      }

      // Generate warm summary
      const summaryMessages: ChatMessage[] = [
        { role: 'system', content: 'You are a warm guide. Briefly summarize what you heard from this family in 2-3 sentences. Be warm and affirming. Do not list items — just reflect the essence back to them naturally.' },
        ...chatMessages,
      ]
      aiResponse = await callOpenAI(summaryMessages, 500)
    } else if (chatMessages.length === 0) {
      // First turn: AI opens the conversation
      responseType = 'question'
      const openingMessages: ChatMessage[] = [
        { role: 'system', content: phaseConfig.systemPrompt + previousDomainContext },
        { role: 'user', content: 'Please begin the conversation with your opening question.' },
      ]
      aiResponse = await callOpenAI(openingMessages, 300)
    } else {
      // Ongoing conversation: ask next question
      responseType = 'question'
      const nextMessages: ChatMessage[] = [
        { role: 'system', content: phaseConfig.systemPrompt + previousDomainContext },
        ...chatMessages,
      ]
      aiResponse = await callOpenAI(nextMessages, 300)
    }

    // Add assistant response to turns
    turns.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
      ...(structuredData ? { extractedData: structuredData } : {}),
    })

    // Update conversation in Supabase
    await supabaseAdmin
      .from('conversations')
      .update({
        turns,
        status: shouldSynthesize ? 'completed' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationRow.id)

    return new Response(JSON.stringify({
      conversationId: conversationRow.id,
      type: responseType,
      message: aiResponse,
      structuredData,
      turnCount: userTurns,
      minTurns: phaseConfig.minTurns,
      maxTurns: phaseConfig.maxTurns,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Onboarding conversation error:', error)
    return new Response(JSON.stringify({ error: 'Failed to process conversation. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
