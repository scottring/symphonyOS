import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SuggestedRule {
  rule: string
  appliesTo: string[]
  rationale: string
  enforcementTip: string
}

interface AIResponse {
  suggestedRules: SuggestedRule[]
  summary: string
}

interface Source {
  title: string
  content: string
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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()

    // Support two modes:
    // 1. Workspace synthesis: { workspaceId, workspaceName }
    // 2. Legacy single resource: { title, content }
    let sources: Source[] = []
    let workspaceName = ''

    if (body.workspaceId) {
      // Fetch all resources in the workspace
      const { data: resources, error: resErr } = await supabase
        .from('planning_resources')
        .select('title, content')
        .eq('workspace_id', body.workspaceId)
        .not('content', 'is', null)

      if (resErr) {
        console.error('Error fetching workspace resources:', resErr)
        return new Response(JSON.stringify({ error: 'Failed to load workspace resources' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      sources = (resources || [])
        .filter(r => r.content?.trim())
        .map(r => ({ title: r.title, content: r.content }))

      workspaceName = body.workspaceName || 'Untitled Workspace'

      if (sources.length === 0) {
        return new Response(JSON.stringify({ error: 'No research content found in this workspace' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (body.content?.trim()) {
      // Legacy single-source mode
      sources = [{ title: body.title || 'Untitled', content: body.content }]
      workspaceName = body.title || 'Untitled'
    } else {
      return new Response(JSON.stringify({ error: 'Either workspaceId or content is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch family context in parallel
    const [
      { data: familyMembers },
      { data: existingRules },
    ] = await Promise.all([
      supabase.from('family_members').select('name, role_label, is_full_user').order('display_order'),
      supabase.from('family_rules').select('rule, status').eq('user_id', user.id),
    ])

    const familyContext = (familyMembers || []).map(m => {
      const role = m.role_label || (m.is_full_user ? 'parent' : 'family member')
      return `- ${m.name} (${role})`
    }).join('\n')

    const existingRulesList = (existingRules || [])
      .map(r => `- "${r.rule}" (${r.status})`)
      .join('\n')

    // Build research content from all sources, with per-source budget
    const charBudget = 8000
    const perSourceBudget = Math.floor(charBudget / sources.length)
    const researchContent = sources.map((s, i) => {
      const truncated = s.content.substring(0, perSourceBudget)
      return `--- Source ${i + 1}: ${s.title} ---\n${truncated}`
    }).join('\n\n')

    const isMultiSource = sources.length > 1

    const systemPrompt = `You are a family coaching AI. A parent has collected ${isMultiSource ? `${sources.length} pieces of research` : 'research material'} about "${workspaceName}". Your job is to read ${isMultiSource ? 'ALL the research and synthesize it into' : 'the research and suggest'} 3-6 practical family rules.

${isMultiSource ? `SYNTHESIS GUIDELINES:
- Look for themes that appear across multiple sources
- When sources agree, cite that convergence in your rationale
- When sources offer different angles, combine them into a more complete rule
- Prioritize rules supported by the strongest evidence across sources
- The result should feel like ONE coherent rule set, not separate rules per source

` : ''}RULE GUIDELINES:
- Rules should be actionable and enforceable (not vague aspirations)
- Rules should be stated positively when possible ("Screens after responsibilities" not "No screens before chores")
- Each rule needs a clear rationale grounded in the research
- Each rule needs a warm, practical enforcement tip (how to hold the boundary lovingly)
- "appliesTo" should list specific family member names when appropriate, or ["everyone"]
- Don't suggest rules that duplicate what the family already has
- Keep rules concise (one sentence)
- Enforcement tips should be 1-2 sentences, warm and coaching-oriented

Return JSON matching this schema:
{
  "suggestedRules": [
    {
      "rule": "The rule statement",
      "appliesTo": ["everyone"] or ["name1", "name2"],
      "rationale": "Why this rule matters, citing the research",
      "enforcementTip": "How to enforce this lovingly"
    }
  ],
  "summary": "${isMultiSource ? '2-3 sentences explaining how the multiple research sources were synthesized into these rules' : '1-2 sentences explaining how the research informed these suggestions'}"
}`

    const userPrompt = `TOPIC: ${workspaceName}

RESEARCH MATERIAL${isMultiSource ? ` (${sources.length} sources)` : ''}:
${researchContent}

FAMILY MEMBERS:
${familyContext || 'No family members configured yet.'}

EXISTING RULES:
${existingRulesList || 'No rules yet.'}

Based on this research, suggest ${isMultiSource ? '3-6' : '2-4'} practical family rules${isMultiSource ? ' that synthesize insights across all sources' : ''}.`

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
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const openAiResult = await openAiResponse.json()
    const responseContent = openAiResult.choices?.[0]?.message?.content
    if (!responseContent) {
      return new Response(JSON.stringify({ error: 'No AI response content' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let parsed: AIResponse
    try {
      parsed = JSON.parse(responseContent)
    } catch {
      console.error('Failed to parse AI response:', responseContent)
      return new Response(JSON.stringify({ error: 'Invalid AI response format' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate and cap at 6 suggestions
    parsed.suggestedRules = (parsed.suggestedRules || [])
      .filter(r => r.rule?.trim())
      .slice(0, 6)

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in suggest-rules-from-research:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
