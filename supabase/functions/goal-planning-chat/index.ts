import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ConversationMessage {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
}

interface PlanningResult {
  strategy: string
  milestones: Array<{
    title: string
    description?: string
    targetDate?: string
    targetValue?: number
    unit?: string
  }>
  suggestedBlocks: Array<{
    label: string
    blockType: string
    timeSlot: string
    narrative: string
    coachingNote?: string
    items?: Array<{ who: string; action: string; context?: string; coaching?: string }>
    dayTypes: string[]
  }>
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
    const { action } = body

    if (action === 'start') {
      const { goalId, goalName, goalNotes, areaName } = body

      const systemPrompt = `You are a warm, insightful life coach within Symphony, a personal operating system. You're helping someone create an actionable plan to achieve a specific goal.

The user's goal: "${goalName}"
${goalNotes ? `Their notes: "${goalNotes}"` : ''}
${areaName ? `Life area: ${areaName}` : ''}

Your job is to understand their goal deeply through 3-4 conversational questions. Ask about:
1. What success looks like specifically (make it measurable)
2. What they've already tried or are currently doing
3. Their constraints (time, resources, schedule)
4. Their timeline and urgency

Be encouraging and practical. Ask one question at a time. Start with a warm acknowledgment of their goal and ask your first question.

Keep responses concise (2-3 sentences max). Be natural, not clinical.`

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Start the goal planning conversation for: ${goalName}` },
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      })

      const aiData = await aiResponse.json()
      const aiMessage = aiData.choices?.[0]?.message?.content || "That's a great goal! Let's figure out how to get you there. What would success look like for you specifically?"

      const now = new Date().toISOString()
      const initialMessages: ConversationMessage[] = [
        { role: 'assistant', content: aiMessage, timestamp: now },
      ]

      const { data: conversation, error: insertErr } = await supabase
        .from('goal_conversations')
        .insert({
          goal_id: goalId,
          user_id: user.id,
          messages: initialMessages,
          status: 'in_progress',
        })
        .select()
        .single()

      if (insertErr) {
        return new Response(JSON.stringify({ error: 'Failed to create conversation' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        conversationId: conversation.id,
        message: aiMessage,
        messages: initialMessages,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'respond') {
      const { conversationId, userMessage } = body
      if (!conversationId || !userMessage) {
        return new Response(JSON.stringify({ error: 'Missing conversationId or userMessage' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: conversation, error: fetchErr } = await supabase
        .from('goal_conversations')
        .select('*')
        .eq('id', conversationId)
        .single()

      if (fetchErr || !conversation) {
        return new Response(JSON.stringify({ error: 'Conversation not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Fetch the goal for context
      const { data: goal } = await supabase
        .from('goals')
        .select('name, notes')
        .eq('id', conversation.goal_id)
        .single()

      const existingMessages: ConversationMessage[] = conversation.messages || []
      const now = new Date().toISOString()
      existingMessages.push({ role: 'user', content: userMessage, timestamp: now })

      const userMsgCount = existingMessages.filter(m => m.role === 'user').length
      const shouldFinish = userMsgCount >= 3

      const systemPrompt = `You are a warm, insightful life coach helping someone plan toward their goal: "${goal?.name || 'their goal'}".
${goal?.notes ? `Their notes: "${goal.notes}"` : ''}

${shouldFinish
        ? 'You now have enough context to create a plan. Thank them warmly and let them know you\'re ready to generate their personalized plan with milestones and daily coaching suggestions. Keep it to 1-2 sentences.'
        : 'Continue the conversation naturally. Ask a follow-up question that helps you understand their situation better. Keep responses to 2-3 sentences. Be practical and encouraging.'}`

      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...existingMessages.map(m => ({ role: m.role, content: m.content })),
      ]

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 300,
        }),
      })

      const aiData = await aiResponse.json()
      const aiMessage = aiData.choices?.[0]?.message?.content || 'Thank you for sharing. Let me create your plan.'

      existingMessages.push({ role: 'assistant', content: aiMessage, timestamp: new Date().toISOString() })

      await supabase
        .from('goal_conversations')
        .update({ messages: existingMessages, updated_at: new Date().toISOString() })
        .eq('id', conversationId)

      return new Response(JSON.stringify({
        conversationId,
        message: aiMessage,
        messages: existingMessages,
        readyToFinish: shouldFinish,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'finish') {
      const { conversationId } = body
      if (!conversationId) {
        return new Response(JSON.stringify({ error: 'Missing conversationId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: conversation, error: fetchErr } = await supabase
        .from('goal_conversations')
        .select('*')
        .eq('id', conversationId)
        .single()

      if (fetchErr || !conversation) {
        return new Response(JSON.stringify({ error: 'Conversation not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Fetch goal and family context
      const [{ data: goal }, { data: familyMembers }] = await Promise.all([
        supabase.from('goals').select('id, name, notes').eq('id', conversation.goal_id).single(),
        supabase.from('family_members').select('name, role_label, is_full_user').order('display_order'),
      ])

      const existingMessages: ConversationMessage[] = conversation.messages || []
      const familyContext = (familyMembers || []).map(m => {
        const role = m.role_label || (m.is_full_user ? 'you' : 'family member')
        return `${m.name} (${role})`
      }).join(', ')

      const planPrompt = `Based on this conversation about the goal "${goal?.name}", generate a structured action plan.

Conversation:
${existingMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

${familyContext ? `Family members: ${familyContext}` : ''}

Return a JSON object with exactly this structure:
{
  "strategy": "A 2-3 sentence summary of the overall approach and key insight from the conversation",
  "milestones": [
    {
      "title": "Short milestone name",
      "description": "What this milestone means",
      "targetDate": "YYYY-MM-DD (optional, reasonable estimate)",
      "targetValue": 5,
      "unit": "lbs (optional, for measurable goals)"
    }
  ],
  "suggestedBlocks": [
    {
      "label": "Block name (e.g., Morning Walk)",
      "blockType": "solo|routine|connection|together",
      "timeSlot": "HH:MM or HH:MM-HH:MM",
      "narrative": "2-3 sentence coaching narrative",
      "coachingNote": "Quick tip",
      "items": [{ "who": "self", "action": "What to do", "context": "Why", "coaching": "Tip" }],
      "dayTypes": ["school-day", "weekend"]
    }
  ]
}

RULES:
- Create 2-5 milestones that build progressively toward the goal
- If the goal is measurable (weight, books, etc.), include targetValue and unit on milestones
- Create 1-3 suggested daily/weekly coaching blocks that support progress
- Block types: solo (individual), routine (daily habit), connection (relationship), together (shared activity)
- Be specific and practical — reference things discussed in the conversation
- Milestones should have realistic target dates spread over a reasonable timeline`

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a JSON-only responder. Return only valid JSON, no markdown.' },
            { role: 'user', content: planPrompt },
          ],
          temperature: 0.5,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
      })

      const aiData = await aiResponse.json()
      const rawContent = aiData.choices?.[0]?.message?.content || '{}'

      let result: PlanningResult
      try {
        result = JSON.parse(rawContent)
      } catch {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0])
        } else {
          result = {
            strategy: 'Plan generated. Review the milestones below.',
            milestones: [],
            suggestedBlocks: [],
          }
        }
      }

      // Save strategy to goals table
      if (goal?.id) {
        await supabase
          .from('goals')
          .update({ strategy: result.strategy })
          .eq('id', goal.id)
      }

      // Save milestones to goal_milestones table
      if (result.milestones?.length && goal?.id) {
        const milestoneRows = result.milestones.map((m, i) => ({
          goal_id: goal.id,
          user_id: user.id,
          title: m.title,
          description: m.description || null,
          target_date: m.targetDate || null,
          target_value: m.targetValue || null,
          unit: m.unit || null,
          sort_order: i,
        }))

        await supabase.from('goal_milestones').insert(milestoneRows)
      }

      // Mark conversation as completed
      await supabase
        .from('goal_conversations')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', conversationId)

      return new Response(JSON.stringify({
        result,
        conversationId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use start, respond, or finish.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Goal planning error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
