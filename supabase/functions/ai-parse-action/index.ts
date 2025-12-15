import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
}

interface ParseActionRequest {
  input: string
  contacts: Contact[]
  actionType?: 'sms' | 'email' // Hint from client-side detection
}

interface ParsedRecipient {
  contactId?: string
  name: string
  phone?: string
  email?: string
}

interface ParseActionResponse {
  isAction: boolean
  actionType?: 'sms' | 'email'
  recipient?: ParsedRecipient
  possibleRecipients?: ParsedRecipient[]
  draftMessage?: string
  subject?: string
  confidence: number
  reasoning?: string
  latencyMs: number
}

const SYSTEM_PROMPT = `You are an assistant that detects communication actions from natural language input.

Your job is to:
1. Determine if the input is a request to send an SMS or email
2. Identify the recipient (matching to provided contacts if possible)
3. Generate an appropriate draft message

## Action Detection

SMS indicators: "text", "txt", "message", "sms", "send a text"
Email indicators: "email", "send an email"

## Recipient Matching

- Match names case-insensitively
- Support partial matches (first name only)
- If multiple contacts match, include all in possibleRecipients
- For SMS, only include contacts with phone numbers
- For email, only include contacts with email addresses

## Message Generation

- Keep messages conversational and appropriate for the medium
- SMS: Keep concise (under 160 chars if possible), casual tone
- Email: Can be longer, may need a subject line
- Expand abbreviated content into full sentences
- Maintain the user's intent but make it polished
- If context is vague, make reasonable assumptions

## Response Format

Return a JSON object with:
- isAction: boolean - Is this a communication action?
- actionType: "sms" | "email" | null
- recipient: { contactId, name, phone, email } - Best match
- possibleRecipients: array of matches if multiple
- draftMessage: The message to send
- subject: For email only
- confidence: 0-1 score
- reasoning: Brief explanation of your parsing

Be concise. Generate natural, human-sounding messages.`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // Authenticate user
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

    const { input, contacts, actionType: hintedType }: ParseActionRequest = await req.json()

    if (!input || typeof input !== 'string') {
      return new Response(JSON.stringify({ error: 'Input is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY not configured')
      return new Response(JSON.stringify({ error: 'AI service not configured - missing ANTHROPIC_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.log('ANTHROPIC_API_KEY found, length:', anthropicApiKey.length)

    // Build the user message with context
    const contactsContext = contacts.length > 0
      ? `\n\nUser's contacts:\n${contacts.map(c =>
          `- ${c.name}${c.phone ? ` (phone: ${c.phone})` : ''}${c.email ? ` (email: ${c.email})` : ''}`
        ).join('\n')}`
      : '\n\nUser has no contacts saved.'

    const typeHint = hintedType
      ? `\n\nClient-side detection suggests this is likely a "${hintedType}" action.`
      : ''

    const userMessage = `Parse this input and determine if it's a communication action:\n\n"${input}"${contactsContext}${typeHint}\n\nRespond with JSON only.`

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userMessage }
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', response.status, errorText)
      return new Response(JSON.stringify({ error: `Claude API error: ${response.status} - ${errorText.slice(0, 200)}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const claudeResponse = await response.json()
    const latencyMs = Date.now() - startTime

    // Extract the text content from Claude's response
    const textContent = claudeResponse.content?.find((c: { type: string }) => c.type === 'text')
    if (!textContent?.text) {
      console.error('No text in Claude response:', claudeResponse)
      return new Response(JSON.stringify({ error: 'Invalid AI response' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse the JSON from Claude's response
    let parsed: ParseActionResponse
    try {
      // Claude might wrap JSON in markdown code blocks
      let jsonText = textContent.text.trim()
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7)
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3)
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3)
      }
      jsonText = jsonText.trim()

      const aiResult = JSON.parse(jsonText)

      parsed = {
        isAction: Boolean(aiResult.isAction),
        actionType: aiResult.actionType || undefined,
        recipient: aiResult.recipient || undefined,
        possibleRecipients: aiResult.possibleRecipients || undefined,
        draftMessage: aiResult.draftMessage || undefined,
        subject: aiResult.subject || undefined,
        confidence: typeof aiResult.confidence === 'number' ? aiResult.confidence : 0.5,
        reasoning: aiResult.reasoning || undefined,
        latencyMs,
      }
    } catch (parseError) {
      console.error('Failed to parse Claude response:', textContent.text, parseError)
      // Return a non-action response if parsing fails
      parsed = {
        isAction: false,
        confidence: 0,
        reasoning: 'Failed to parse AI response',
        latencyMs,
      }
    }

    // Log for debugging
    console.log('AI Parse Action:', { input, result: parsed })

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('ai-parse-action error:', error)
    return new Response(JSON.stringify({ error: `Unexpected error: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
