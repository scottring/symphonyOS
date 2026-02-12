// generate-yearbook-content — Generates personalized entries from a family manual
// Creates a mix of stories, activities, reflections, discussions, goals, checklists,
// tasks, milestones, and insights — all grounded in the family's 8-domain manual data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ==================== Types ====================

interface GenerateRequest {
  householdId: string
  personId: string
  yearbookId: string
  manualId: string
  count?: number  // how many entries to generate (default: 10)
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ==================== OpenAI Client ====================

async function callOpenAI(messages: ChatMessage[], maxTokens = 4000): Promise<string> {
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
      temperature: 0.8,
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
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim())
  }
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }
  throw new Error('No valid JSON found in response')
}

// ==================== Developmental Level ====================

function getDevelopmentalLevel(age: number | null): string {
  if (!age || age < 0) return 'adult'
  if (age < 6) return 'early-childhood'
  if (age < 10) return 'middle-childhood'
  if (age < 13) return 'pre-teen'
  if (age < 18) return 'teen'
  return 'adult'
}

function getAgeGuidance(level: string): string {
  switch (level) {
    case 'early-childhood':
      return 'Ages 0-5: Simple language, sensory activities, short stories with animal characters, picture-based checklists. Focus on routines, feelings vocabulary, and imaginative play.'
    case 'middle-childhood':
      return 'Ages 6-9: Growing independence, concrete thinking. Activities with clear steps, stories about friendship and fairness, discussions about rules and choices.'
    case 'pre-teen':
      return 'Ages 10-12: Abstract thinking emerging, identity forming. Reflections on personal values, discussions about peer dynamics, goal-setting with tangible milestones.'
    case 'teen':
      return 'Ages 13-17: Complex thinking, identity exploration. Deep reflections, discussions about autonomy and responsibility, long-term goal cascades, stories about navigating conflict.'
    case 'adult':
      return 'Adult: Full complexity. Strategic reflections, partnership discussions, resource management goals, family leadership insights.'
    default:
      return 'Adult: Full complexity.'
  }
}

// ==================== Entry Generation Prompt ====================

function buildGenerationPrompt(
  manualDomains: Record<string, unknown>,
  personName: string,
  personAge: number | null,
  existingTitles: string[],
  count: number,
): ChatMessage[] {
  const level = getDevelopmentalLevel(personAge)
  const ageGuidance = getAgeGuidance(level)
  const manualSummary = JSON.stringify(manualDomains, null, 2)

  const existingContext = existingTitles.length > 0
    ? `\n\nEXISTING ENTRIES (do NOT duplicate these):\n${existingTitles.map(t => `- ${t}`).join('\n')}`
    : ''

  const systemPrompt = `You are a family systems expert generating personalized yearbook entries for "${personName}" (${personAge ? `age ${personAge}` : 'adult'}).

DEVELOPMENTAL LEVEL: ${level}
${ageGuidance}

FAMILY MANUAL DATA:
${manualSummary}
${existingContext}

Generate exactly ${count} entries as a JSON array. Each entry must include:
- "type": one of "story", "activity", "reflection", "discussion", "goal", "checklist", "task", "milestone", "insight"
- "domain": one of "values", "communication", "connection", "roles", "organization", "adaptability", "problemSolving", "resources"
- "title": a compelling, specific title (not generic)
- "content": an object with a "kind" field matching the type, plus type-specific fields

CONTENT SHAPES BY TYPE:

story: { "kind": "story", "body": "the full story text (2-4 paragraphs)", "theme": "theme name", "readAloud": true/false }
activity: { "kind": "activity", "instructions": "step-by-step instructions", "duration": "30 mins", "materials": ["item1"], "ageRange": { "min": 4, "max": 8 } }
reflection: { "kind": "reflection", "prompt": "a thoughtful question to reflect on", "sentiment": "positive" | "neutral" | "difficult" }
discussion: { "kind": "discussion", "prompt": "discussion topic", "suggestedScript": "opening words to start the conversation", "targetAudience": "family" | "couple" | "parent-child" }
goal: { "kind": "goal", "description": "specific goal description", "targetDate": "2026-06-01", "progress": 0 }
checklist: { "kind": "checklist", "items": [{ "id": "c1", "label": "item text", "checked": false }], "frequency": "daily" | "weekly" | "once" }
task: { "kind": "task", "description": "what needs to be done", "completed": false }
milestone: { "kind": "milestone", "description": "what this milestone represents", "celebrationNote": "how to celebrate when achieved" }
insight: { "kind": "insight", "body": "the insight text", "source": "Based on your family's [domain] patterns", "actionable": true/false }

REQUIREMENTS:
1. Generate a MIX of types — at least 4 different types represented
2. Cover at least 4 different domains
3. Every entry MUST reference specific details from the family manual (values, rituals, pain points, etc.)
4. Stories should be personalized (use family values, real situations described in the manual)
5. Discussions should address real challenges or growth areas from the manual
6. Goals should target specific gaps or aspirations mentioned in the manual
7. Checklists should operationalize routines or systems from the organization domain
8. Each entry should feel like it was made FOR this specific family, not generic

Return ONLY a valid JSON array. No markdown fences, no explanation.`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Generate ${count} personalized yearbook entries for ${personName}.` },
  ]
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

    const body: GenerateRequest = await req.json()
    const { householdId, personId, yearbookId, manualId, count = 10 } = body

    if (!householdId || !personId || !yearbookId || !manualId) {
      return new Response(JSON.stringify({ error: 'householdId, personId, yearbookId, and manualId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch manual domains
    const { data: manual, error: manualError } = await supabaseAdmin
      .from('manuals')
      .select('domains')
      .eq('id', manualId)
      .single()

    if (manualError || !manual) {
      return new Response(JSON.stringify({ error: 'Manual not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch person info (name, age)
    const { data: person } = await supabaseAdmin
      .from('family_members')
      .select('name, date_of_birth')
      .eq('id', personId)
      .single()

    const personName = person?.name || 'Family Member'
    let personAge: number | null = null
    if (person?.date_of_birth) {
      const dob = new Date(person.date_of_birth)
      const today = new Date()
      personAge = today.getFullYear() - dob.getFullYear()
      if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) {
        personAge--
      }
    }

    // Fetch existing entries to avoid duplication
    const { data: existingEntries } = await supabaseAdmin
      .from('entries')
      .select('title')
      .eq('yearbook_id', yearbookId)

    const existingTitles = (existingEntries || []).map((e: { title: string }) => e.title)

    // Generate entries via OpenAI
    const messages = buildGenerationPrompt(manual.domains, personName, personAge, existingTitles, count)
    const rawResponse = await callOpenAI(messages)

    let generatedEntries: Array<{
      type: string
      domain: string
      title: string
      content: Record<string, unknown>
    }>

    try {
      generatedEntries = parseJsonFromResponse(rawResponse) as typeof generatedEntries
    } catch {
      // Retry with stricter prompt
      const retryMessages: ChatMessage[] = [
        { role: 'system', content: 'You must return ONLY a valid JSON array with no other text. No markdown fences.' },
        ...messages.slice(1),
      ]
      const retryResponse = await callOpenAI(retryMessages)
      generatedEntries = parseJsonFromResponse(retryResponse) as typeof generatedEntries
    }

    if (!Array.isArray(generatedEntries)) {
      throw new Error('Generated entries is not an array')
    }

    // Batch insert entries into database
    const entryRows = generatedEntries.map(entry => ({
      household_id: householdId,
      user_id: user.id,
      manual_id: manualId,
      yearbook_id: yearbookId,
      person_id: personId,
      type: entry.type,
      source: 'system',
      domain: entry.domain,
      title: entry.title,
      content: entry.content,
      linked_entry_ids: [],
      lifecycle: 'active',
      visibility: 'family',
    }))

    const { data: insertedEntries, error: insertError } = await supabaseAdmin
      .from('entries')
      .insert(entryRows)
      .select()

    if (insertError) {
      throw new Error(`Failed to insert entries: ${insertError.message}`)
    }

    // Update yearbook chapters with new entry IDs
    const entryIds = (insertedEntries || []).map((e: { id: string }) => e.id)

    const { data: yearbook } = await supabaseAdmin
      .from('yearbooks')
      .select('chapters')
      .eq('id', yearbookId)
      .single()

    const existingChapters = yearbook?.chapters || []

    // Group entries by domain to create/update chapters
    const entriesByDomain: Record<string, string[]> = {}
    for (const entry of insertedEntries || []) {
      const domain = entry.domain as string
      if (!entriesByDomain[domain]) entriesByDomain[domain] = []
      entriesByDomain[domain].push(entry.id)
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

    const updatedChapters = [...existingChapters]
    for (const [domain, newIds] of Object.entries(entriesByDomain)) {
      const existingChapter = updatedChapters.find(c => c.id === `chapter-${domain}`)
      if (existingChapter) {
        existingChapter.entryIds = [...new Set([...existingChapter.entryIds, ...newIds])]
      } else {
        updatedChapters.push({
          id: `chapter-${domain}`,
          title: DOMAIN_NAMES[domain] || domain,
          entryIds: newIds,
          isActive: true,
        })
      }
    }

    await supabaseAdmin
      .from('yearbooks')
      .update({ chapters: updatedChapters, updated_at: new Date().toISOString() })
      .eq('id', yearbookId)

    return new Response(JSON.stringify({
      entries: insertedEntries,
      yearbookId,
      count: entryIds.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Yearbook generation error:', error)
    return new Response(JSON.stringify({
      error: 'Failed to generate yearbook content. Please try again.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
