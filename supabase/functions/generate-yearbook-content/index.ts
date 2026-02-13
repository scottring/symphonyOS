// generate-yearbook-content — Assessment-aware weekly yearbook generation
// Pulls assessment data + Symphony progress → generates weekly journal entries
// Multi-phase: context gathering → theme extraction → content plan → generation → validation

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
  count?: number
  weekNumber?: number
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type LLMProvider = 'anthropic' | 'openai'

interface WeeklyContext {
  assessmentSummary: string
  activeActions: Array<{ title: string; domain: string; type: string; priority: string }>
  completedThisWeek: Array<{ title: string; type: string }>
  harmonyScores: Record<string, number>
  recentAssessments: string[]
}

// ==================== Model-Agnostic LLM Client ====================

function getProvider(): LLMProvider {
  if (Deno.env.get('ANTHROPIC_API_KEY')) return 'anthropic'
  if (Deno.env.get('OPENAI_API_KEY')) return 'openai'
  throw new Error('No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.')
}

async function callLLM(
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const provider = getProvider()
  const { maxTokens = 4000, temperature = 0.6 } = options

  if (provider === 'anthropic') {
    return callAnthropic(messages, maxTokens, temperature)
  }
  return callOpenAI(messages, maxTokens, temperature)
}

async function callAnthropic(messages: ChatMessage[], maxTokens: number, temperature: number): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!

  const systemMsg = messages.find(m => m.role === 'system')?.content || ''
  const nonSystemMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5-20250929',
      max_tokens: maxTokens,
      temperature,
      system: systemMsg,
      messages: nonSystemMessages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.status} ${error}`)
  }

  const data = await response.json()
  return data.content[0].text
}

async function callOpenAI(messages: ChatMessage[], maxTokens: number, temperature: number): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')!

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o',
      max_tokens: maxTokens,
      temperature,
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

// ==================== Weekly Context Gathering ====================

async function gatherWeeklyContext(
  supabaseAdmin: ReturnType<typeof createClient>,
  householdId: string,
  manualDomains: Record<string, unknown>,
): Promise<WeeklyContext> {
  // Get active assessment actions
  const { data: actions } = await supabaseAdmin
    .from('assessment_actions')
    .select('title, domain_id, action_type, priority, status, symphony_item_id')
    .eq('household_id', householdId)
    .in('status', ['suggested', 'accepted', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(20)

  // Get recently completed actions (last 7 days)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { data: completedActions } = await supabaseAdmin
    .from('assessment_actions')
    .select('title, action_type')
    .eq('household_id', householdId)
    .eq('status', 'completed')
    .gte('updated_at', weekAgo.toISOString())

  // Get recently completed tasks (last 7 days)
  const { data: completedTasks } = await supabaseAdmin
    .from('tasks')
    .select('title')
    .eq('household_id', householdId)
    .eq('completed', true)
    .gte('updated_at', weekAgo.toISOString())
    .limit(10)

  // Build harmony scores from manual domains
  const harmonyScores: Record<string, number> = {}
  const recentAssessments: string[] = []
  const DOMAIN_NAMES: Record<string, string> = {
    values: 'Values & Identity', communication: 'Communication',
    connection: 'Connection', roles: 'Roles & Responsibilities',
    organization: 'Organization & Spaces', adaptability: 'Adaptability',
    problemSolving: 'Problem Solving', resources: 'Resource Management',
  }

  for (const [domainId, domainData] of Object.entries(manualDomains)) {
    const d = domainData as Record<string, unknown>
    if (d.harmonyScore && typeof d.harmonyScore === 'number') {
      harmonyScores[domainId] = d.harmonyScore
    }
    if (d.lastAssessedAt) {
      const assessedDate = new Date(d.lastAssessedAt as string)
      if (assessedDate > weekAgo) {
        recentAssessments.push(domainId)
      }
    }
  }

  const assessedDomains = Object.entries(harmonyScores)
    .map(([id, score]) => `${DOMAIN_NAMES[id] || id}: ${score}/100`)
    .join(', ')

  const activeActionsList = (actions || []).map(a => ({
    title: a.title,
    domain: a.domain_id,
    type: a.action_type,
    priority: a.priority,
  }))

  const completedList = [
    ...(completedActions || []).map(a => ({ title: a.title, type: a.action_type })),
    ...(completedTasks || []).map(t => ({ title: t.title, type: 'task' })),
  ]

  const assessmentSummary = `Current harmony scores: ${assessedDomains || 'No domains assessed yet'}. ` +
    `Active action items: ${activeActionsList.length}. ` +
    `Completed this week: ${completedList.length} items.` +
    (recentAssessments.length > 0
      ? ` Recently assessed: ${recentAssessments.map(d => DOMAIN_NAMES[d] || d).join(', ')}.`
      : '')

  return {
    assessmentSummary,
    activeActions: activeActionsList,
    completedThisWeek: completedList,
    harmonyScores,
    recentAssessments,
  }
}

// ==================== Phase 1: Theme Extraction ====================

async function extractWeeklyThemes(
  manualDomains: Record<string, unknown>,
  weeklyContext: WeeklyContext,
  personName: string,
  personAge: number | null,
): Promise<string> {
  const level = getDevelopmentalLevel(personAge)
  const manualSummary = JSON.stringify(manualDomains, null, 2)

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a family systems expert creating a weekly journal brief. Analyze the family's manual data AND their current progress to create a focused creative brief (~600 words) for THIS WEEK's yearbook entries.

This is a WEEKLY progress journal, not a one-time yearbook. Content should feel timely and connected to what the family is actually working on.

CURRENT CONTEXT:
${weeklyContext.assessmentSummary}

${weeklyContext.activeActions.length > 0 ? `ACTIVE ACTIONS (what they're working on):\n${weeklyContext.activeActions.map(a => `- [${a.priority}] ${a.title} (${a.domain}, ${a.type})`).join('\n')}` : ''}

${weeklyContext.completedThisWeek.length > 0 ? `COMPLETED THIS WEEK:\n${weeklyContext.completedThisWeek.map(c => `- ${c.title} (${c.type})`).join('\n')}` : ''}

Extract:
1. THIS WEEK'S FOCUS — What should the family focus on based on active actions and recent assessments?
2. CELEBRATIONS — What did they complete? What progress to acknowledge?
3. NARRATIVE HOOKS — 2-3 specific situations for stories, tied to current work
4. GROWTH EDGES — Areas with low harmony scores or active issues
5. ACTIVITIES — What hands-on activities would support their current action items?
6. REFLECTION PROMPT — A thoughtful question tied to what they're working through
7. PERSON CONTEXT — ${personName} is ${personAge ? `${personAge} years old (${level})` : 'an adult'}.

Write as flowing prose, not bullets. Reference specific details.`,
    },
    {
      role: 'user',
      content: `Family manual data:\n\n${manualSummary}\n\nProduce this week's creative brief for ${personName}'s journal.`,
    },
  ]

  return await callLLM(messages, { maxTokens: 1000, temperature: 0.5 })
}

// ==================== Phase 2: Content Plan ====================

interface ContentPlanEntry {
  type: string
  domain: string
  angle: string
  title_hint: string
}

async function buildWeeklyPlan(
  themesBrief: string,
  weeklyContext: WeeklyContext,
  personName: string,
  level: string,
  existingTitles: string[],
  count: number,
): Promise<ContentPlanEntry[]> {
  const existingContext = existingTitles.length > 0
    ? `\nEXISTING ENTRIES (avoid overlap):\n${existingTitles.map(t => `- ${t}`).join('\n')}`
    : ''

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a content strategist for a weekly family progress journal. Given a creative brief and the family's current progress, plan exactly ${count} entries for THIS WEEK.

WEEKLY DISTRIBUTION (adjust to count):
- 1 story (narrative tied to this week's theme or a current action item)
- 1 reflection (question about current progress or challenges)
- 1 activity (hands-on, supports an active action item)
- 1 discussion (conversation starter about a current growth area)
- 1 checklist or goal (tied to an active action)
- 1 insight or celebration (acknowledging progress)

KEY PRINCIPLE: Entries should feel connected to what the family is ACTUALLY working on. Reference specific action items, harmony scores, or recent completions.

${weeklyContext.completedThisWeek.length > 0 ? `CELEBRATE: ${weeklyContext.completedThisWeek.map(c => c.title).join(', ')}` : ''}
${weeklyContext.activeActions.length > 0 ? `SUPPORT: ${weeklyContext.activeActions.slice(0, 5).map(a => `${a.title} (${a.domain})`).join(', ')}` : ''}

DEVELOPMENTAL LEVEL: ${level}
${existingContext}

Return a JSON array:
{ "type": "story|activity|reflection|discussion|goal|checklist|task|milestone|insight", "domain": "values|communication|connection|roles|organization|adaptability|problemSolving|resources", "angle": "specific angle tied to current work (1 sentence)", "title_hint": "working title" }

Cover at least 3 different domains. Return ONLY the JSON array.`,
    },
    {
      role: 'user',
      content: `CREATIVE BRIEF:\n${themesBrief}\n\nPlan ${count} entries for ${personName}'s weekly journal.`,
    },
  ]

  const raw = await callLLM(messages, { maxTokens: 1500, temperature: 0.55 })
  return parseJsonFromResponse(raw) as ContentPlanEntry[]
}

// ==================== Phase 3: Multi-Call Generation ====================

const STORY_EXAMPLE = `{
  "type": "story",
  "domain": "values",
  "title": "The Long Way Home",
  "content": {
    "kind": "story",
    "body": "There's a route from school that takes twelve minutes if you go direct. The Hernandez family hasn't taken it once.\\n\\nEvery afternoon, Mia and her brother Leo argue about which detour to take. Today it's the path through Miller's Creek park, where someone has built a tiny fairy house out of sticks and moss near the footbridge. Leo adds a pebble roof while Mia draws a map of their discoveries in her composition book.\\n\\nThey arrive home forty minutes later, shoes muddy, with a story about a hawk they saw diving into the creek. Their mother doesn't ask why they're late. She asks what they found.\\n\\nThis is what the family means when they say they value curiosity over efficiency. Not as a bumper sticker, but as a daily practice — the willingness to trade twelve minutes for forty, certainty for wonder, getting there for getting lost and finding something better.",
    "theme": "curiosity over efficiency",
    "readAloud": true
  }
}`

const DISCUSSION_EXAMPLE = `{
  "type": "discussion",
  "domain": "communication",
  "title": "The Repair Conversation",
  "content": {
    "kind": "discussion",
    "prompt": "Think about the last time one of us said something that landed differently than we intended. What did it feel like in the gap between when it was said and when we came back to fix it? What helped the repair happen?",
    "suggestedScript": "I've been thinking about how we handle those moments when we accidentally hurt each other. Can we talk about what our repair looks like — and whether there's a way to make that gap smaller?",
    "targetAudience": "couple"
  }
}`

async function generateAnchorEntries(
  plan: ContentPlanEntry[],
  themesBrief: string,
  personName: string,
  level: string,
  ageGuidance: string,
): Promise<unknown[]> {
  const anchorTypes = ['story', 'discussion', 'reflection']
  const anchorPlan = plan.filter(p => anchorTypes.includes(p.type))
  if (anchorPlan.length === 0) return []

  const planText = anchorPlan.map((p, i) => `${i + 1}. Type: ${p.type}, Domain: ${p.domain}, Angle: ${p.angle}, Title hint: ${p.title_hint}`).join('\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a master storyteller creating THIS WEEK's journal entries for "${personName}".

IMPORTANT: These entries are part of a WEEKLY progress journal. They should feel timely — connected to what the family is working on RIGHT NOW, not generic.

DEVELOPMENTAL LEVEL: ${level}
${ageGuidance}

CREATIVE BRIEF:
${themesBrief}

QUALITY STANDARDS:
- Stories: 2-4 paragraphs, vivid sensory details, specific to this family's current situation. Show values through action. For children, stories can address behavioral needs through narrative.
- Discussions: Prompts that go beneath the surface. Tied to what they're actively working on.
- Reflections: Questions that make people pause. Connected to real progress or challenges.

FEW-SHOT EXAMPLES:
Story: ${STORY_EXAMPLE}
Discussion: ${DISCUSSION_EXAMPLE}

Generate entries for the plan below. Each must include: type, domain, title, content (with kind field + type-specific fields).

Return ONLY a valid JSON array.`,
    },
    {
      role: 'user',
      content: `Generate these anchor entries:\n${planText}`,
    },
  ]

  const raw = await callLLM(messages, { maxTokens: 4000, temperature: 0.6 })
  return parseJsonFromResponse(raw) as unknown[]
}

async function generateInteractiveEntries(
  plan: ContentPlanEntry[],
  themesBrief: string,
  personName: string,
  level: string,
  ageGuidance: string,
): Promise<unknown[]> {
  const interactiveTypes = ['activity', 'checklist', 'goal']
  const interactivePlan = plan.filter(p => interactiveTypes.includes(p.type))
  if (interactivePlan.length === 0) return []

  const planText = interactivePlan.map((p, i) => `${i + 1}. Type: ${p.type}, Domain: ${p.domain}, Angle: ${p.angle}, Title hint: ${p.title_hint}`).join('\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a family activity designer creating THIS WEEK's journal entries for "${personName}".

These should DIRECTLY SUPPORT the family's active action items and current focus areas.

DEVELOPMENTAL LEVEL: ${level}
${ageGuidance}

CREATIVE BRIEF:
${themesBrief}

CONTENT SHAPES:
activity: { "kind": "activity", "instructions": "step-by-step", "duration": "30 mins", "materials": ["item1"], "ageRange": { "min": 4, "max": 8 } }
checklist: { "kind": "checklist", "items": [{ "id": "c1", "label": "text", "checked": false }], "frequency": "daily" | "weekly" | "once" }
goal: { "kind": "goal", "description": "specific goal", "targetDate": "2026-03-01", "progress": 0 }

QUALITY:
- Activities: Specific materials, clear steps, tied to active assessment actions
- Checklists: Operationalize what they're working on. Include times where relevant.
- Goals: Specific, measurable, with realistic weekly or monthly targets

Return ONLY a valid JSON array.`,
    },
    {
      role: 'user',
      content: `Generate these interactive entries:\n${planText}`,
    },
  ]

  const raw = await callLLM(messages, { maxTokens: 2500, temperature: 0.55 })
  return parseJsonFromResponse(raw) as unknown[]
}

async function generateSupportingEntries(
  plan: ContentPlanEntry[],
  themesBrief: string,
  weeklyContext: WeeklyContext,
  personName: string,
  level: string,
  ageGuidance: string,
): Promise<unknown[]> {
  const supportingTypes = ['insight', 'milestone', 'task']
  const supportingPlan = plan.filter(p => supportingTypes.includes(p.type))
  if (supportingPlan.length === 0) return []

  const planText = supportingPlan.map((p, i) => `${i + 1}. Type: ${p.type}, Domain: ${p.domain}, Angle: ${p.angle}, Title hint: ${p.title_hint}`).join('\n')

  const completionContext = weeklyContext.completedThisWeek.length > 0
    ? `\nCOMPLETED THIS WEEK (celebrate these!):\n${weeklyContext.completedThisWeek.map(c => `- ${c.title}`).join('\n')}`
    : ''

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a family insights expert creating THIS WEEK's journal entries for "${personName}".

DEVELOPMENTAL LEVEL: ${level}
${ageGuidance}

CREATIVE BRIEF:
${themesBrief}
${completionContext}

CONTENT SHAPES:
insight: { "kind": "insight", "body": "the insight text", "source": "Based on your family's [domain] patterns", "actionable": true/false }
milestone: { "kind": "milestone", "description": "what this milestone represents", "celebrationNote": "how to celebrate" }
task: { "kind": "task", "description": "what needs to be done", "completed": false }

QUALITY:
- Insights: Pull-quote worthy. Concise but profound. Reference specific progress or patterns.
- Milestones: Celebrate real completions and progress. Not trivial.
- Tasks: Concrete next steps tied to active actions.

Return ONLY a valid JSON array.`,
    },
    {
      role: 'user',
      content: `Generate these supporting entries:\n${planText}`,
    },
  ]

  const raw = await callLLM(messages, { maxTokens: 1500, temperature: 0.55 })
  return parseJsonFromResponse(raw) as unknown[]
}

// ==================== Weekly Highlights ====================

function generateWeeklyHighlights(
  weeklyContext: WeeklyContext,
  validatedCount: number,
): string[] {
  const highlights: string[] = []

  if (weeklyContext.completedThisWeek.length > 0) {
    highlights.push(`Completed ${weeklyContext.completedThisWeek.length} item${weeklyContext.completedThisWeek.length > 1 ? 's' : ''} this week`)
  }

  if (weeklyContext.recentAssessments.length > 0) {
    const DOMAIN_NAMES: Record<string, string> = {
      values: 'Values', communication: 'Communication', connection: 'Connection',
      roles: 'Roles', organization: 'Organization', adaptability: 'Adaptability',
      problemSolving: 'Problem Solving', resources: 'Resources',
    }
    highlights.push(`Assessed ${weeklyContext.recentAssessments.map(d => DOMAIN_NAMES[d] || d).join(' & ')}`)
  }

  if (validatedCount > 0) {
    highlights.push(`${validatedCount} new journal entries generated`)
  }

  const highScoreDomains = Object.entries(weeklyContext.harmonyScores)
    .filter(([, score]) => score >= 75)
    .map(([domain]) => domain)
  if (highScoreDomains.length > 0) {
    highlights.push(`${highScoreDomains.length} domain${highScoreDomains.length > 1 ? 's' : ''} in harmony`)
  }

  return highlights
}

// ==================== Validation ====================

interface ValidatedEntry {
  type: string
  domain: string
  title: string
  content: Record<string, unknown>
}

const VALID_TYPES = new Set(['story', 'activity', 'reflection', 'discussion', 'goal', 'checklist', 'task', 'milestone', 'insight'])
const VALID_DOMAINS = new Set(['values', 'communication', 'connection', 'roles', 'organization', 'adaptability', 'problemSolving', 'resources'])

function validateEntries(rawEntries: unknown[]): ValidatedEntry[] {
  const validated: ValidatedEntry[] = []

  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>

    if (!e.type || !e.domain || !e.title || !e.content) continue
    if (!VALID_TYPES.has(e.type as string)) continue
    if (!VALID_DOMAINS.has(e.domain as string)) continue
    if (typeof e.title !== 'string' || e.title.length < 3) continue
    if (typeof e.content !== 'object') continue

    const content = e.content as Record<string, unknown>
    if (!content.kind) continue

    if (e.type === 'story' && typeof content.body === 'string' && content.body.length < 100) continue
    if (e.type === 'activity' && typeof content.instructions === 'string' && content.instructions.length < 50) continue

    validated.push({
      type: e.type as string,
      domain: e.domain as string,
      title: e.title as string,
      content: content,
    })
  }

  return validated
}

// ==================== Week Number Helper ====================

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function getWeekRange(year: number, weekNum: number): { start: string; end: string } {
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const jan1Day = jan1.getUTCDay() || 7
  const mondayOfWeek1 = new Date(jan1)
  mondayOfWeek1.setUTCDate(jan1.getUTCDate() + (1 - jan1Day))
  if (jan1Day > 4) mondayOfWeek1.setUTCDate(mondayOfWeek1.getUTCDate() + 7)

  const weekStart = new Date(mondayOfWeek1)
  weekStart.setUTCDate(weekStart.getUTCDate() + (weekNum - 1) * 7)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

  return {
    start: weekStart.toISOString().slice(0, 10),
    end: weekEnd.toISOString().slice(0, 10),
  }
}

// ==================== Main Handler ====================

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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body: GenerateRequest = await req.json()
    const { householdId, personId, yearbookId, manualId, count = 6 } = body
    const weekNumber = body.weekNumber || getWeekNumber(new Date())
    const currentYear = new Date().getFullYear()

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

    // Fetch person info
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
    const level = getDevelopmentalLevel(personAge)
    const ageGuidance = getAgeGuidance(level)

    // ===== Gather weekly context from assessments + Symphony =====
    const weeklyContext = await gatherWeeklyContext(supabaseAdmin, householdId, manual.domains)

    // ===== Phase 1: Theme extraction with weekly context =====
    const themesBrief = await extractWeeklyThemes(manual.domains, weeklyContext, personName, personAge)

    // ===== Phase 2: Weekly content plan =====
    const contentPlan = await buildWeeklyPlan(themesBrief, weeklyContext, personName, level, existingTitles, count)

    // ===== Phase 3: Multi-call generation =====
    const [anchorEntries, interactiveEntries, supportingEntries] = await Promise.all([
      generateAnchorEntries(contentPlan, themesBrief, personName, level, ageGuidance),
      generateInteractiveEntries(contentPlan, themesBrief, personName, level, ageGuidance),
      generateSupportingEntries(contentPlan, themesBrief, weeklyContext, personName, level, ageGuidance),
    ])

    const allRawEntries = [...anchorEntries, ...interactiveEntries, ...supportingEntries]

    // ===== Phase 4: Validation =====
    const validatedEntries = validateEntries(allRawEntries)

    if (validatedEntries.length === 0) {
      throw new Error('No entries passed validation')
    }

    const failureRate = 1 - (validatedEntries.length / allRawEntries.length)
    if (failureRate > 0.3) {
      console.warn(`High failure rate: ${Math.round(failureRate * 100)}% of entries failed validation. Proceeding with ${validatedEntries.length} valid entries.`)
    }

    // ===== Insert entries =====
    const entryRows = validatedEntries.map(entry => ({
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

    // ===== Generate weekly highlights =====
    const highlights = generateWeeklyHighlights(weeklyContext, validatedEntries.length)

    // ===== Update yearbook chapters as weekly sections =====
    const entryIds = (insertedEntries || []).map((e: { id: string }) => e.id)

    const { data: yearbook } = await supabaseAdmin
      .from('yearbooks')
      .select('chapters')
      .eq('id', yearbookId)
      .single()

    const existingChapters = yearbook?.chapters || []
    const weekId = `week-${weekNumber}`
    const weekRange = getWeekRange(currentYear, weekNumber)

    const weeklyProgress = {
      harmonySnapshot: weeklyContext.harmonyScores,
      harmonyChanges: {},
      actionsCompleted: weeklyContext.completedThisWeek.map(c => c.title),
      symphonyItemsCompleted: weeklyContext.completedThisWeek.filter(c => c.type === 'task').map(c => c.title),
      domainsAssessed: weeklyContext.recentAssessments,
      highlights,
    }

    const existingWeek = existingChapters.find((c: { id: string }) => c.id === weekId)
    let updatedChapters
    if (existingWeek) {
      updatedChapters = existingChapters.map((c: { id: string; entryIds: string[] }) =>
        c.id === weekId
          ? { ...c, entryIds: [...new Set([...c.entryIds, ...entryIds])], progress: weeklyProgress }
          : c
      )
    } else {
      updatedChapters = [
        ...existingChapters,
        {
          id: weekId,
          title: `Week ${weekNumber}`,
          description: highlights[0] || undefined,
          entryIds,
          period: weekRange,
          weekNumber,
          isActive: true,
          progress: weeklyProgress,
        },
      ]
    }

    await supabaseAdmin
      .from('yearbooks')
      .update({ chapters: updatedChapters, updated_at: new Date().toISOString() })
      .eq('id', yearbookId)

    return new Response(JSON.stringify({
      entries: insertedEntries,
      yearbookId,
      weekNumber,
      count: entryIds.length,
      highlights,
      validationStats: {
        generated: allRawEntries.length,
        validated: validatedEntries.length,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Yearbook generation error:', error)
    return new Response(JSON.stringify({
      error: 'Failed to generate weekly journal content. Please try again.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
