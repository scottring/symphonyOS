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

interface AssessmentResult {
  summary: string
  strengths: string[]
  issues: string[]
  opportunities: string[]
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
    const { layerId, layerName, domainSlug, domainName, domainSubtitle, quickAssessment, messages, action } = body

    // action: 'start' | 'respond' | 'finish'

    if (action === 'start') {
      // Generate initial AI questions based on the domain and quick assessment data
      const systemPrompt = `You are a warm, insightful family coach specializing in ${layerName || 'household harmony'}.
You're conducting a deep assessment of the "${domainName}" domain (${domainSubtitle}).

The user rated this domain ${quickAssessment?.harmonyScore || '?'}/100 in their quick assessment.
${quickAssessment?.challengeNote ? `They noted: "${quickAssessment.challengeNote}"` : ''}
${quickAssessment?.strengths?.length ? `Quick strengths: ${quickAssessment.strengths.join(', ')}` : ''}
${quickAssessment?.issues?.length ? `Quick issues: ${quickAssessment.issues.join(', ')}` : ''}

Your goal is to understand their situation deeply through 3-4 conversational questions. Be empathetic, specific, and non-judgmental. Ask one question at a time. Start with a warm acknowledgment of their self-assessment, then ask your first probing question.

Keep responses concise (2-3 sentences max per message). Don't use bullet points in conversation — be natural.`

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
            { role: 'user', content: `Start the deep assessment conversation for ${domainName}.` },
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      })

      const aiData = await aiResponse.json()
      const aiMessage = aiData.choices?.[0]?.message?.content || 'Let me learn more about this area. Can you tell me what a typical day looks like?'

      // Create conversation record in DB
      const now = new Date().toISOString()
      const initialMessages: ConversationMessage[] = [
        { role: 'assistant', content: aiMessage, timestamp: now },
      ]

      const { data: conversation, error: insertErr } = await supabase
        .from('assessment_conversations')
        .insert({
          user_id: user.id,
          layer_id: layerId,
          domain_slug: domainSlug,
          messages: initialMessages,
          status: 'in_progress',
        })
        .select()
        .single()

      if (insertErr) {
        console.error('Error creating conversation:', insertErr)
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

      // Fetch existing conversation
      const { data: conversation, error: fetchErr } = await supabase
        .from('assessment_conversations')
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

      // Add user message
      existingMessages.push({ role: 'user', content: userMessage, timestamp: now })

      // Check if we have enough context (3+ user responses) to wrap up
      const userMsgCount = existingMessages.filter(m => m.role === 'user').length
      const shouldFinish = userMsgCount >= 4

      const systemPrompt = `You are a warm, insightful family coach specializing in ${layerName || 'household harmony'}.
You're conducting a deep assessment of the "${domainName}" domain (${domainSubtitle}).

Quick assessment score: ${quickAssessment?.harmonyScore || '?'}/100
${quickAssessment?.challengeNote ? `Initial note: "${quickAssessment.challengeNote}"` : ''}

${shouldFinish
        ? 'You now have enough context. Thank the user warmly and let them know you\'re preparing their personalized assessment. Keep it to 1-2 sentences.'
        : 'Continue the conversation naturally. Ask a follow-up question that digs deeper. Keep responses to 2-3 sentences. Be empathetic and specific.'}
`

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
      const aiMessage = aiData.choices?.[0]?.message?.content || 'Thank you for sharing. Let me prepare your assessment.'

      existingMessages.push({ role: 'assistant', content: aiMessage, timestamp: new Date().toISOString() })

      // Update conversation in DB
      await supabase
        .from('assessment_conversations')
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

      // Fetch conversation
      const { data: conversation, error: fetchErr } = await supabase
        .from('assessment_conversations')
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

      // Generate structured assessment from the full conversation
      const summaryPrompt = `You are a family coaching expert. Based on this conversation about the "${domainName}" domain, generate a structured assessment.

Conversation:
${existingMessages.map(m => `${m.role}: ${m.content}`).join('\n')}

Return a JSON object with exactly this structure:
{
  "summary": "A concise one-sentence summary of where they are in this domain",
  "strengths": ["2-4 specific strengths observed"],
  "issues": ["2-4 specific issues or challenges identified"],
  "opportunities": ["2-4 actionable opportunities for improvement"]
}

Be specific, empathetic, and actionable. Reference things they actually said.`

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
            { role: 'user', content: summaryPrompt },
          ],
          temperature: 0.5,
          max_tokens: 800,
        }),
      })

      const aiData = await aiResponse.json()
      const rawContent = aiData.choices?.[0]?.message?.content || '{}'

      let result: AssessmentResult
      try {
        result = JSON.parse(rawContent)
      } catch {
        // Try to extract JSON from potential markdown wrapping
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0])
        } else {
          result = {
            summary: 'Assessment completed. Review your conversation for insights.',
            strengths: [],
            issues: [],
            opportunities: [],
          }
        }
      }

      // Update domain_assessments with the results
      const { error: upsertErr } = await supabase
        .from('domain_assessments')
        .upsert({
          user_id: user.id,
          layer_id: conversation.layer_id,
          domain_slug: conversation.domain_slug,
          summary: result.summary,
          strengths: result.strengths,
          issues: result.issues,
          opportunities: result.opportunities,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,layer_id,domain_slug',
        })

      if (upsertErr) {
        console.error('Error updating domain assessment:', upsertErr)
      }

      // Mark conversation as completed
      await supabase
        .from('assessment_conversations')
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
    console.error('Deep assessment error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
