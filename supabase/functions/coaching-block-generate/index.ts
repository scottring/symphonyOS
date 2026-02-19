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

interface MatchedRule {
  id: string
  rule: string
  category: string
  enforcementTip?: string
}

interface ItemContext {
  type: string
  title: string
  startTime?: string
  endTime?: string
  context?: string
  notes?: string
  category?: string
}

interface CoachingBlockSuggestion {
  label: string
  blockType: string
  timeSlot: string
  narrative: string
  coachingNote?: string
  items: { who: string; action: string; context?: string; coaching?: string }[]
  dayTypes: string[]
  sourceRuleIds?: string[]
}

interface Observation {
  observation: string
  tags: string[]
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
    const { action, item, matchedRules, existingBlock, conversationId, userMessage } = body as {
      action: 'auto' | 'chat-start' | 'chat-respond' | 'chat-finish'
      item: ItemContext
      matchedRules: MatchedRule[]
      existingBlock?: { id: string; label: string; narrative: string; items: unknown[] } | null
      conversationId?: string
      userMessage?: string
    }

    // Fetch family members for context
    const { data: familyMembers } = await supabase
      .from('family_members')
      .select('name, role')
      .eq('user_id', user.id)

    const familyContext = (familyMembers || [])
      .map((m: { name: string; role: string }) => `${m.name} (${m.role})`)
      .join(', ')

    // Fetch coaching observations for persistent memory
    const { data: observations } = await supabase
      .from('coaching_observations')
      .select('observation, tags, relevance_count')
      .eq('user_id', user.id)
      .order('relevance_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20)

    const memoryContext = (observations || []).length > 0
      ? (observations || []).map((o: { observation: string }) => `- ${o.observation}`).join('\n')
      : 'No prior observations yet.'

    // Build rules context
    const rulesContext = (matchedRules || []).length > 0
      ? (matchedRules || []).map((r: MatchedRule) => `- [${r.category}] ${r.rule}${r.enforcementTip ? ` (Tip: ${r.enforcementTip})` : ''}`).join('\n')
      : 'No specific rules matched.'

    // ── AUTO: Generate a coaching block directly ──
    if (action === 'auto') {
      const systemPrompt = `You are a coaching assistant for Symphony, a daily life operating system.
The user is looking at a specific item on their timeline and wants coaching.

ITEM: "${item.title}" at ${item.startTime || 'unscheduled'} (${item.context || 'no context'} domain)
${item.notes ? `NOTES: ${item.notes}` : ''}

MATCHED RULES:
${rulesContext}

FAMILY: ${familyContext || 'No family members configured'}

YOUR MEMORY (observations from past interactions):
${memoryContext}

${existingBlock ? `EXISTING COACHING BLOCK: "${existingBlock.label}" — user wants to update it.` : 'No existing coaching block for this item.'}

Generate a PlaybookBlock with:
- A warm, specific narrative (2-4 sentences) that references what you know about this family
- Practical action items with who/action (use actual family member names)
- A coaching note with personalized insight
- An appropriate blockType: solo, transition, routine, connection, together, buffer, departure, partner, sibling, household

Also extract 1-2 new observations about this user/family from this interaction context.

Return JSON only:
{
  "suggestion": {
    "label": "short block name",
    "blockType": "connection",
    "timeSlot": "${item.startTime || '08:00'}",
    "narrative": "warm narrative text",
    "coachingNote": "personalized coaching insight",
    "items": [{ "who": "name", "action": "what to do", "context": "why" }],
    "dayTypes": ["school-day"]
  },
  "observations": [{ "observation": "insight text", "tags": ["tag1", "tag2"] }]
}`

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
            { role: 'user', content: systemPrompt },
          ],
          temperature: 0.7,
          max_tokens: 800,
        }),
      })

      const aiData = await aiResponse.json()
      const rawContent = aiData.choices?.[0]?.message?.content || '{}'

      let parsed: { suggestion: CoachingBlockSuggestion; observations: Observation[] }
      try {
        parsed = JSON.parse(rawContent)
      } catch {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      // Store new observations
      if (parsed.observations?.length > 0) {
        const observationRows = parsed.observations.map((o: Observation) => ({
          user_id: user.id,
          observation: o.observation,
          domain: item.context || null,
          tags: o.tags || [],
          source_type: 'auto',
        }))
        await supabase.from('coaching_observations').insert(observationRows)
      }

      // Add sourceRuleIds from matched rules
      if (parsed.suggestion) {
        parsed.suggestion.sourceRuleIds = (matchedRules || []).map((r: MatchedRule) => r.id)
      }

      return new Response(JSON.stringify({
        suggestion: parsed.suggestion,
        observations: parsed.observations || [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── CHAT-START: Begin a coaching conversation ──
    if (action === 'chat-start') {
      const systemPrompt = `You are a warm, insightful coaching assistant for Symphony, a daily life operating system.
The user wants to discuss coaching for a specific item on their timeline.

ITEM: "${item.title}" at ${item.startTime || 'unscheduled'} (${item.context || 'no context'} domain)
${item.notes ? `NOTES: ${item.notes}` : ''}

MATCHED RULES:
${rulesContext}

FAMILY: ${familyContext || 'No family members configured'}

YOUR MEMORY (observations from past interactions):
${memoryContext}

Start a brief coaching conversation. Acknowledge the item, reference relevant rules or past observations if available, and ask one focused question about how you can help with coaching for this moment. Keep it to 2-3 sentences. Be warm and specific.`

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
            { role: 'user', content: `Start a coaching conversation about "${item.title}".` },
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      })

      const aiData = await aiResponse.json()
      const aiMessage = aiData.choices?.[0]?.message?.content || 'I\'d love to help you prepare for this. What would be most helpful?'

      const now = new Date().toISOString()
      const initialMessages: ConversationMessage[] = [
        { role: 'assistant', content: aiMessage, timestamp: now },
      ]

      const { data: conversation, error: insertErr } = await supabase
        .from('coaching_conversations')
        .insert({
          user_id: user.id,
          item_type: item.type,
          item_id: body.itemId || '',
          item_title: item.title,
          item_context: item.context || null,
          item_time: item.startTime || null,
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

    // ── CHAT-RESPOND: Continue a conversation ──
    if (action === 'chat-respond') {
      if (!conversationId || !userMessage) {
        return new Response(JSON.stringify({ error: 'Missing conversationId or userMessage' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: conversation, error: fetchErr } = await supabase
        .from('coaching_conversations')
        .select('*')
        .eq('id', conversationId)
        .single()

      if (fetchErr || !conversation) {
        return new Response(JSON.stringify({ error: 'Conversation not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const existingMessages: ConversationMessage[] = conversation.messages || []
      const now = new Date().toISOString()
      existingMessages.push({ role: 'user', content: userMessage, timestamp: now })

      const userMsgCount = existingMessages.filter((m: ConversationMessage) => m.role === 'user').length
      const readyToFinish = userMsgCount >= 2

      const systemPrompt = `You are a warm, insightful coaching assistant for Symphony.
You're discussing coaching for "${item.title}" at ${item.startTime || 'unscheduled'} (${item.context || 'no context'} domain).

MATCHED RULES:
${rulesContext}

FAMILY: ${familyContext || 'No family members configured'}

YOUR MEMORY:
${memoryContext}

${readyToFinish
  ? 'You now have enough context. Respond naturally to the user\'s message, then let them know you can generate a coaching block whenever they\'re ready. Keep it to 2-3 sentences.'
  : 'Continue the conversation. Ask a follow-up that helps you understand their needs for this moment. Keep responses to 2-3 sentences.'}
`

      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...existingMessages.map((m: ConversationMessage) => ({ role: m.role, content: m.content })),
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
      const aiMessage = aiData.choices?.[0]?.message?.content || 'Thank you for sharing. I can generate a coaching block whenever you\'re ready.'

      existingMessages.push({ role: 'assistant', content: aiMessage, timestamp: new Date().toISOString() })

      await supabase
        .from('coaching_conversations')
        .update({ messages: existingMessages, updated_at: new Date().toISOString() })
        .eq('id', conversationId)

      return new Response(JSON.stringify({
        conversationId,
        message: aiMessage,
        messages: existingMessages,
        readyToFinish,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── CHAT-FINISH: Synthesize conversation into a coaching block ──
    if (action === 'chat-finish') {
      if (!conversationId) {
        return new Response(JSON.stringify({ error: 'Missing conversationId' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: conversation, error: fetchErr } = await supabase
        .from('coaching_conversations')
        .select('*')
        .eq('id', conversationId)
        .single()

      if (fetchErr || !conversation) {
        return new Response(JSON.stringify({ error: 'Conversation not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const existingMessages: ConversationMessage[] = conversation.messages || []

      const synthesisPrompt = `Based on this coaching conversation, generate a PlaybookBlock and extract observations.

CONVERSATION:
${existingMessages.map((m: ConversationMessage) => `${m.role}: ${m.content}`).join('\n')}

ITEM: "${item.title}" at ${item.startTime || 'unscheduled'} (${item.context || 'no context'} domain)
FAMILY: ${familyContext || 'No family members configured'}

RULES REFERENCED:
${rulesContext}

Generate:
1. A PlaybookBlock with warm narrative, practical items with who/action, and a coaching note
2. 1-3 observations about this family distilled from the conversation

Return JSON only:
{
  "suggestion": {
    "label": "short block name",
    "blockType": "connection",
    "timeSlot": "${item.startTime || '08:00'}",
    "narrative": "warm narrative text referencing conversation",
    "coachingNote": "personalized insight from discussion",
    "items": [{ "who": "name", "action": "what to do", "context": "why" }],
    "dayTypes": ["school-day"]
  },
  "observations": [{ "observation": "insight text", "tags": ["tag1", "tag2"] }]
}`

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
            { role: 'user', content: synthesisPrompt },
          ],
          temperature: 0.5,
          max_tokens: 800,
        }),
      })

      const aiData = await aiResponse.json()
      const rawContent = aiData.choices?.[0]?.message?.content || '{}'

      let parsed: { suggestion: CoachingBlockSuggestion; observations: Observation[] }
      try {
        parsed = JSON.parse(rawContent)
      } catch {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        } else {
          return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      // Store observations
      if (parsed.observations?.length > 0) {
        const observationRows = parsed.observations.map((o: Observation) => ({
          user_id: user.id,
          observation: o.observation,
          domain: item.context || null,
          tags: o.tags || [],
          source_type: 'conversation',
          source_id: conversationId,
        }))
        await supabase.from('coaching_observations').insert(observationRows)
      }

      // Add sourceRuleIds
      if (parsed.suggestion) {
        parsed.suggestion.sourceRuleIds = (matchedRules || []).map((r: MatchedRule) => r.id)
      }

      // Mark conversation completed
      await supabase
        .from('coaching_conversations')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', conversationId)

      return new Response(JSON.stringify({
        suggestion: parsed.suggestion,
        observations: parsed.observations || [],
        conversationId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use auto, chat-start, chat-respond, or chat-finish.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Coaching block generate error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
