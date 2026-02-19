import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SuggestionBlock {
  type: 'modify' | 'add' | 'remove'
  blockId?: string          // for modify/remove
  label: string
  blockType: string
  timeSlot?: string
  narrative?: string
  coachingNote?: string
  items?: { who: string; action: string; context?: string; coaching?: string }[]
  dayTypes?: string[]
  reason: string            // why the AI suggests this
}

interface AIResponse {
  suggestions: SuggestionBlock[]
  coachingInsights: string   // summary for the parent
  weeklyTheme?: string       // optional thematic focus
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auth: get the user from the JWT
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the user's JWT
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { weekOf } = await req.json()
    if (!weekOf) {
      return new Response(JSON.stringify({ error: 'weekOf is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Calculate last week's date range
    const targetMonday = new Date(weekOf + 'T00:00:00')
    const lastMonday = new Date(targetMonday)
    lastMonday.setDate(lastMonday.getDate() - 7)
    const lastSunday = new Date(targetMonday)
    lastSunday.setDate(lastSunday.getDate() - 1)
    const lastWeekStart = lastMonday.toISOString().split('T')[0]
    const lastWeekEnd = lastSunday.toISOString().split('T')[0]

    // Fetch all context in parallel
    const [
      { data: familyMembers },
      { data: currentBlocks },
      { data: lastWeekInstances },
      { data: activeRules },
      { data: responsibilities },
    ] = await Promise.all([
      supabase.from('family_members').select('name, color, is_full_user, member_type, role_label').order('display_order'),
      supabase.from('playbook_blocks').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('playbook_instances').select('*, playbook_blocks(label, block_type)').gte('date', lastWeekStart).lte('date', lastWeekEnd),
      supabase.from('family_rules').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('responsibilities').select('*').eq('user_id', user.id).eq('status', 'active'),
    ])

    // Build feedback summary per block
    const feedbackByBlock = new Map<string, {
      label: string
      blockType: string
      completions: number
      total: number
      reacts: Record<string, number>
      tags: Record<string, number>
      notes: string[]
    }>()

    for (const inst of (lastWeekInstances || [])) {
      const blockId = inst.block_id
      const blockInfo = inst.playbook_blocks as { label: string; block_type: string } | null
      if (!feedbackByBlock.has(blockId)) {
        feedbackByBlock.set(blockId, {
          label: blockInfo?.label || 'Unknown',
          blockType: blockInfo?.block_type || 'routine',
          completions: 0,
          total: 0,
          reacts: {},
          tags: {},
          notes: [],
        })
      }
      const summary = feedbackByBlock.get(blockId)!
      summary.total++
      if (inst.completed) summary.completions++
      if (inst.react) summary.reacts[inst.react] = (summary.reacts[inst.react] || 0) + 1
      for (const tag of (inst.tags || [])) {
        summary.tags[tag] = (summary.tags[tag] || 0) + 1
      }
      if (inst.notes) summary.notes.push(inst.notes)
    }

    const feedbackSummary = Array.from(feedbackByBlock.entries()).map(([blockId, s]) => ({
      blockId,
      ...s,
      completionRate: s.total > 0 ? Math.round((s.completions / s.total) * 100) : 0,
    }))

    // Build the family context string
    const familyContext = (familyMembers || []).map(m => {
      const role = m.role_label || (m.is_full_user ? 'parent (you)' : 'family member')
      return `- ${m.name} (${role})`
    }).join('\n')

    const currentBlocksSummary = (currentBlocks || []).map(b => ({
      id: b.id,
      label: b.label,
      blockType: b.block_type,
      timeSlot: b.time_slot,
      dayTypes: b.day_types,
      narrative: b.narrative?.substring(0, 100) + (b.narrative?.length > 100 ? '...' : ''),
      itemCount: (b.items || []).length,
    }))

    const rulesSummary = (activeRules || []).map(r => ({
      rule: r.rule,
      appliesTo: r.applies_to,
      rationale: r.rationale,
    }))

    const responsibilitiesSummary = (responsibilities || []).map(r => ({
      who: r.who,
      task: r.task,
      frequency: r.frequency,
    }))

    // Build the AI prompt
    const systemPrompt = `You are a family coaching AI for Symphony, a daily life operating system. Your role is to review a family's weekly playbook performance and suggest refinements for next week.

You understand family dynamics deeply. Your suggestions should be:
- Warm and encouraging, never judgmental
- Specific to the family members' needs
- Grounded in what the feedback data tells you
- Focused on one or two key improvements, not overwhelming changes

RELATIONSHIP TYPES you should coach across:
- Parent-child: Daily routines, coaching moments, educational play
- Partner: Connection rituals, co-parenting sync, communication blocks
- Sibling: Shared activities, fairness coaching, cooperation building
- Household: Family meetings, shared rituals, home maintenance, traditions

BLOCK TYPES available:
- solo: Individual time (self-care, focus work)
- transition: Moving between activities
- routine: Daily necessities (morning prep, meals)
- connection: Intentional relationship moments
- together: Shared family activities
- buffer: Flexible/downtime
- departure: Leaving rituals
- partner: Couple connection blocks
- sibling: Sibling interaction coaching
- household: Whole-family activities

Return your response as JSON matching this schema:
{
  "suggestions": [
    {
      "type": "modify" | "add" | "remove",
      "blockId": "uuid (for modify/remove only)",
      "label": "Block label",
      "blockType": "one of the block types above",
      "timeSlot": "HH:MM or HH:MM-HH:MM",
      "narrative": "The coaching narrative (2-4 sentences, warm and specific)",
      "coachingNote": "A quick coaching tip for the parent",
      "items": [{ "who": "name", "action": "what to do", "context": "why", "coaching": "personalized tip" }],
      "dayTypes": ["school-day", "weekend"],
      "reason": "Why you're suggesting this change"
    }
  ],
  "coachingInsights": "A 2-3 sentence summary of the week and what to focus on",
  "weeklyTheme": "Optional: a short thematic focus for the week (e.g., 'Building sibling cooperation')"
}

RULES:
- Maximum 5 suggestions per week (focus, not overwhelm)
- For "modify" suggestions, only include fields that should change
- For "add" suggestions, include all fields
- For "remove" suggestions, include blockId, label, and reason
- If feedback shows a block with 2+ "tough" reacts, prioritize modifying it
- If no partner blocks exist and there are 2+ family members, suggest adding one
- If completion rate is very low (<30%) for a block, consider removing or simplifying it
- Always ground your coaching narrative in the specific family member names`

    const userPrompt = `Here is this family's context for the week of ${weekOf}:

FAMILY MEMBERS:
${familyContext}

CURRENT PLAYBOOK BLOCKS (${currentBlocksSummary.length} blocks):
${JSON.stringify(currentBlocksSummary, null, 2)}

LAST WEEK'S FEEDBACK:
${feedbackSummary.length > 0 ? JSON.stringify(feedbackSummary, null, 2) : 'No feedback data yet (this may be their first week).'}

ACTIVE FAMILY RULES (${rulesSummary.length}):
${rulesSummary.length > 0 ? JSON.stringify(rulesSummary, null, 2) : 'No rules established yet.'}

RESPONSIBILITIES (${responsibilitiesSummary.length}):
${responsibilitiesSummary.length > 0 ? JSON.stringify(responsibilitiesSummary, null, 2) : 'No responsibilities assigned yet.'}

Based on this data, provide your suggestions for next week's playbook. Focus on what would make the biggest positive impact.`

    // Call OpenAI
    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
    })

    if (!openAiResponse.ok) {
      const errText = await openAiResponse.text()
      console.error('OpenAI error:', errText)
      return new Response(JSON.stringify({ error: 'AI generation failed', details: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const openAiResult = await openAiResponse.json()
    const content = openAiResult.choices?.[0]?.message?.content
    if (!content) {
      return new Response(JSON.stringify({ error: 'No AI response content' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let parsed: AIResponse
    try {
      parsed = JSON.parse(content)
    } catch {
      console.error('Failed to parse AI response:', content)
      return new Response(JSON.stringify({ error: 'Invalid AI response format' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate and sanitize suggestions
    const validTypes = ['modify', 'add', 'remove']
    parsed.suggestions = (parsed.suggestions || [])
      .filter(s => validTypes.includes(s.type))
      .slice(0, 5) // Max 5 suggestions

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in generate-weekly-playbook:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
