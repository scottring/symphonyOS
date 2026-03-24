import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ════════════════════════════════════════════════════════════════
// GMAIL CHECK — Reads inbox, processes emails via Claude Haiku,
// and writes proposed actions to action_queue table.
//
// Auth: Supports both user JWT (manual "check my email") and
// service role key (cron/scheduler invocation with user_id param).
//
// Gmail scopes required on the Google OAuth connection:
//   - https://www.googleapis.com/auth/gmail.readonly
//   - https://www.googleapis.com/auth/gmail.send
//
// These scopes are configured in:
//   supabase/functions/google-calendar-auth-url/index.ts (line ~57)
//
// To add gmail.send scope, update the scopes array there and have
// the user disconnect + reconnect Google to re-consent.
// ════════════════════════════════════════════════════════════════

interface GmailMessage {
  id: string
  threadId: string
  payload: {
    headers: Array<{ name: string; value: string }>
    body?: { data?: string }
    parts?: Array<{
      mimeType: string
      body?: { data?: string }
      parts?: Array<{ mimeType: string; body?: { data?: string } }>
    }>
  }
  snippet: string
  internalDate: string
}

interface ParsedEmail {
  messageId: string
  threadId: string
  from: string
  to: string
  subject: string
  date: string
  body: string
  snippet: string
}

interface ActionQueueEntry {
  user_id: string
  action_type: 'send_email' | 'create_task' | 'schedule_meeting'
  summary: string
  payload: Record<string, unknown>
  source: 'email'
  source_ref: string
  context: Record<string, unknown>
  status: 'proposed'
}

// Decode base64url encoded content from Gmail
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  return atob(base64)
}

// Extract plain text body from Gmail message
function extractBody(message: GmailMessage): string {
  const { payload } = message

  // Simple body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  // Multipart — find text/plain first, then fall back to text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data)
      }
      // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
      if (part.parts) {
        for (const subpart of part.parts) {
          if (subpart.mimeType === 'text/plain' && subpart.body?.data) {
            return decodeBase64Url(subpart.body.data)
          }
        }
      }
    }
    // Fallback to HTML with tags stripped
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64Url(part.body.data)
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
  }

  return message.snippet || ''
}

// Get header value from Gmail message
function getHeader(message: GmailMessage, name: string): string {
  const header = message.payload.headers.find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )
  return header?.value || ''
}

// Refresh Google access token (same pattern as google-calendar-events)
async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json()
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`)
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  await supabase
    .from('calendar_connections')
    .update({
      access_token: data.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'google')

  return data.access_token
}

// Resolve the authenticated user — supports both JWT and service-role + user_id
async function resolveUserId(
  req: Request,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ userId: string; error?: string }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return { userId: '', error: 'Missing authorization header' }
  }

  const token = authHeader.replace('Bearer ', '')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  // If the token IS the service role key, expect user_id in the body
  if (token === serviceRoleKey) {
    try {
      const body = await req.clone().json()
      if (body.user_id) {
        return { userId: body.user_id }
      }
      return { userId: '', error: 'Service role call requires user_id in body' }
    } catch {
      return { userId: '', error: 'Invalid JSON body' }
    }
  }

  // Otherwise, treat as user JWT
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
  if (userError || !user) {
    return { userId: '', error: 'Unauthorized' }
  }

  return { userId: user.id }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Resolve user
    const { userId, error: authError } = await resolveUserId(req, supabaseAdmin)
    if (authError) {
      return new Response(JSON.stringify({ error: authError }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get Google OAuth tokens from calendar_connections
    const { data: connection, error: connError } = await supabaseAdmin
      .from('calendar_connections')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single()

    if (connError || !connection?.refresh_token) {
      return new Response(JSON.stringify({
        error: 'No Google connection found. Connect Google with Gmail scope.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Refresh token if expired or about to expire
    let accessToken = connection.access_token
    const expiresAt = new Date(connection.token_expires_at)
    const fiveMinutes = 5 * 60 * 1000
    if (!accessToken || expiresAt.getTime() - Date.now() < fiveMinutes) {
      accessToken = await refreshAccessToken(supabaseAdmin, userId, connection.refresh_token)
    }

    // ── Fetch unread emails from Gmail ──────────────────────────
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread in:inbox')}&maxResults=10`
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const searchData = await searchRes.json()

    if (searchData.error) {
      if (searchData.error.code === 403) {
        return new Response(JSON.stringify({
          error: 'Gmail access not authorized. Disconnect and reconnect Google to grant email permissions.',
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`Gmail search failed: ${JSON.stringify(searchData.error)}`)
    }

    const messageRefs = searchData.messages || []
    if (messageRefs.length === 0) {
      return new Response(JSON.stringify({
        message: 'No unread emails in inbox',
        emails_processed: 0,
        actions_proposed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check which messages already have action_queue entries (deduplicate)
    const messageIds = messageRefs.map((m: { id: string }) => m.id)
    const { data: existingActions } = await supabaseAdmin
      .from('action_queue')
      .select('source_ref')
      .eq('user_id', userId)
      .eq('source', 'email')
      .in('source_ref', messageIds)

    const alreadyProcessed = new Set((existingActions || []).map(a => a.source_ref))
    const newMessageIds = messageIds.filter((id: string) => !alreadyProcessed.has(id))

    if (newMessageIds.length === 0) {
      return new Response(JSON.stringify({
        message: 'All unread emails already processed',
        emails_processed: 0,
        actions_proposed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch full message content for new messages
    const parsedEmails: ParsedEmail[] = []
    for (const msgId of newMessageIds) {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`
      const res = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const msg = await res.json() as GmailMessage

      if (!msg.payload) continue

      const from = getHeader(msg, 'From')
      const to = getHeader(msg, 'To')
      const subject = getHeader(msg, 'Subject')
      const date = getHeader(msg, 'Date')
      const body = extractBody(msg).slice(0, 3000) // Truncate long emails

      parsedEmails.push({
        messageId: msgId,
        threadId: msg.threadId,
        from,
        to,
        subject,
        date,
        body,
        snippet: msg.snippet || '',
      })
    }

    if (parsedEmails.length === 0) {
      return new Response(JSON.stringify({
        message: 'No processable emails found',
        emails_processed: 0,
        actions_proposed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Load contacts for sender matching ───────────────────────
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id, name, email, category')
      .eq('user_id', userId)

    const contactList = (contacts || []).map(c =>
      `${c.name} (${c.category || 'other'}, email: ${c.email || 'unknown'}, id: ${c.id})`
    )

    // ── Process emails with Claude Haiku ────────────────────────
    const emailSummaries = parsedEmails.map((e, i) => ({
      index: i,
      message_id: e.messageId,
      thread_id: e.threadId,
      from: e.from,
      to: e.to,
      subject: e.subject,
      date: e.date,
      body: e.body,
    }))

    const systemPrompt = `You are an email processing assistant for a personal operating system called Symphony.
Your job is to analyze emails and extract actionable items.

The user's contacts:
${contactList.length > 0 ? contactList.join('\n') : '(no contacts yet)'}

Today's date: ${new Date().toISOString().split('T')[0]}

For each email, return a JSON object with:
{
  "results": [
    {
      "email_index": 0,
      "summary": "1-2 sentence summary of the email",
      "needs_reply": true/false,
      "matched_contact_id": "uuid or null",
      "actions": [
        {
          "action_type": "send_email" | "create_task" | "schedule_meeting",
          "summary": "Human-readable description of what to do",
          "payload": {
            // For send_email: { "to": "email", "subject": "Re: ...", "draft_body": "...", "thread_id": "...", "in_reply_to": "message-id-header" }
            // For create_task: { "title": "...", "notes": "...", "context": "work|family|personal" }
            // For schedule_meeting: { "title": "...", "suggested_time": "...", "attendees": ["email"], "notes": "..." }
          }
        }
      ]
    }
  ]
}

Rules:
- Only propose actions for emails that genuinely need a response or have action items.
- Skip marketing, newsletters, automated notifications, and spam — return empty actions array for those.
- For replies, draft a professional, concise response. Include the thread_id and construct an appropriate In-Reply-To header value.
- For tasks, extract a clear title and any relevant context.
- Match senders to contacts by email address when possible.
- Be conservative — only propose actions when clearly needed.
- If an email is purely informational with no action needed, return an empty actions array.`

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `Analyze these emails and extract actions:\n\n${JSON.stringify(emailSummaries, null, 2)}`,
          },
        ],
        system: systemPrompt,
      }),
    })

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text()
      throw new Error(`Anthropic API error (${aiResponse.status}): ${errBody}`)
    }

    const aiData = await aiResponse.json()
    const aiText = aiData.content?.[0]?.text || '{}'

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = aiText
    const jsonMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    let parsed: { results: Array<{
      email_index: number
      summary: string
      needs_reply: boolean
      matched_contact_id: string | null
      actions: Array<{
        action_type: 'send_email' | 'create_task' | 'schedule_meeting'
        summary: string
        payload: Record<string, unknown>
      }>
    }> }

    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error('Failed to parse AI response:', aiText)
      throw new Error('Failed to parse AI response as JSON')
    }

    const results = parsed.results || []

    // ── Write actions to action_queue ────────────────────────────
    let actionsProposed = 0
    for (const result of results) {
      const email = parsedEmails[result.email_index]
      if (!email) continue

      for (const action of result.actions) {
        const entry: ActionQueueEntry = {
          user_id: userId,
          action_type: action.action_type,
          summary: action.summary,
          payload: action.payload,
          source: 'email',
          source_ref: email.messageId,
          context: {
            email_subject: email.subject,
            email_from: email.from,
            email_date: email.date,
            email_snippet: email.snippet,
            email_summary: result.summary,
            matched_contact_id: result.matched_contact_id,
            thread_id: email.threadId,
          },
          status: 'proposed',
        }

        const { error: insertError } = await supabaseAdmin
          .from('action_queue')
          .insert(entry)

        if (insertError) {
          console.error('Failed to insert action:', insertError)
        } else {
          actionsProposed++
        }
      }
    }

    // Build response summary
    const summaries = results.map(r => {
      const email = parsedEmails[r.email_index]
      return {
        subject: email?.subject || 'Unknown',
        from: email?.from || 'Unknown',
        summary: r.summary,
        needs_reply: r.needs_reply,
        actions_count: r.actions.length,
      }
    })

    return new Response(JSON.stringify({
      message: `Processed ${parsedEmails.length} emails, proposed ${actionsProposed} actions`,
      emails_processed: parsedEmails.length,
      actions_proposed: actionsProposed,
      summaries,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Gmail check error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
