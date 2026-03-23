import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ════════════════════════════════════════════════════════════════
// EMAIL SCANNER — Scans Gmail for family-relevant action items
// Extracts structured actions using AI, writes to email_action_items
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

interface ExtractedAction {
  title: string
  description: string
  category: 'school' | 'medical' | 'social' | 'financial' | 'household'
  urgency: 'urgent' | 'normal' | 'low'
  due_date: string | null
  amount_cents: number | null
  relevant_member: string | null
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

  // Multipart — find text/plain or text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data)
      }
      // Nested multipart
      if (part.parts) {
        for (const subpart of part.parts) {
          if (subpart.mimeType === 'text/plain' && subpart.body?.data) {
            return decodeBase64Url(subpart.body.data)
          }
        }
      }
    }
    // Fallback to HTML
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64Url(part.body.data)
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
  }

  return message.snippet || ''
}

// Get header value
function getHeader(message: GmailMessage, name: string): string {
  const header = message.payload.headers.find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )
  return header?.value || ''
}

// Refresh Google access token
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
    .update({ access_token: data.access_token, token_expires_at: expiresAt })
    .eq('user_id', userId)
    .eq('provider', 'google')

  return data.access_token
}

// Privacy filter — skip sensitive senders
const SENSITIVE_PATTERNS = [
  /bank|chase|wells.fargo|bofa|capital.one|citi/i,
  /hipaa|medical.records|patient.portal/i,
  /irs|tax.return|w-2|1099/i,
  /social.security|ssn/i,
  /password.reset|security.alert|verify.your/i,
]

function isSensitive(from: string, subject: string): boolean {
  const combined = `${from} ${subject}`
  return SENSITIVE_PATTERNS.some(p => p.test(combined))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get Google OAuth tokens
    const { data: connection } = await supabase
      .from('calendar_connections')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single()

    if (!connection?.refresh_token) {
      return new Response(JSON.stringify({ error: 'No Google connection found. Reconnect Google with Gmail scope.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Refresh token if expired
    let accessToken = connection.access_token
    if (!accessToken || new Date(connection.token_expires_at) <= new Date()) {
      accessToken = await refreshAccessToken(supabase, user.id, connection.refresh_token)
    }

    // Search Gmail for family-relevant emails from last 24 hours
    const searchQueries = [
      'newer_than:1d category:primary',
      'newer_than:1d (permission slip OR field trip OR picture day OR school event)',
      'newer_than:1d (playdate OR birthday party OR RSVP OR invitation)',
      'newer_than:1d (appointment OR reminder OR due date)',
    ]

    const allMessageIds = new Set<string>()
    for (const q of searchQueries) {
      const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=20`
      const res = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()

      if (data.error) {
        // Check if this is a scope error
        if (data.error.code === 403) {
          return new Response(JSON.stringify({
            error: 'Gmail access not authorized. Disconnect and reconnect Google to grant email permissions.',
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        console.error('Gmail search error:', data.error)
        continue
      }

      for (const msg of (data.messages || [])) {
        allMessageIds.add(msg.id)
      }
    }

    if (allMessageIds.size === 0) {
      return new Response(JSON.stringify({ message: 'No new emails found', items: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check which message IDs we've already processed
    const { data: existing } = await supabase
      .from('email_action_items')
      .select('email_message_id')
      .eq('user_id', user.id)
      .in('email_message_id', [...allMessageIds])

    const existingIds = new Set((existing || []).map(e => e.email_message_id))
    const newMessageIds = [...allMessageIds].filter(id => !existingIds.has(id))

    if (newMessageIds.length === 0) {
      return new Response(JSON.stringify({ message: 'All emails already processed', items: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch full message content (limit to 10 per run)
    const messagesToProcess = newMessageIds.slice(0, 10)
    const messages: Array<{ id: string; from: string; subject: string; date: string; body: string }> = []

    for (const msgId of messagesToProcess) {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`
      const res = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const msg = await res.json() as GmailMessage

      const from = getHeader(msg, 'From')
      const subject = getHeader(msg, 'Subject')
      const date = getHeader(msg, 'Date')

      // Privacy filter
      if (isSensitive(from, subject)) continue

      const body = extractBody(msg).slice(0, 2000) // Truncate long emails

      messages.push({ id: msgId, from, subject, date, body })
    }

    if (messages.length === 0) {
      return new Response(JSON.stringify({ message: 'No actionable emails after filtering', items: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get family members for the AI to reference
    const { data: familyMembers } = await supabase
      .from('family_members')
      .select('id, name, role_label')
      .eq('user_id', user.id)

    const memberNames = (familyMembers || []).map(m => `${m.name} (${m.role_label || 'member'}, id: ${m.id})`)

    // AI extraction
    if (!openAiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You extract family-relevant action items from emails. The family members are:
${memberNames.join('\n')}

Return JSON: { "actions": [...] } where each action has:
- email_index: number (index in the emails array)
- title: string (concise action item, e.g. "Send $5 for Ella's field trip by Thursday")
- description: string (brief context from the email)
- category: "school" | "medical" | "social" | "financial" | "household"
- urgency: "urgent" (due within 2 days or requires immediate action) | "normal" | "low"
- due_date: "YYYY-MM-DD" or null
- amount_cents: number or null (e.g. $5 = 500)
- relevant_member_id: family member UUID this is about, or null

Rules:
- Only extract items that require action (not informational newsletters, receipts, or confirmations)
- Skip marketing emails, promotions, and spam
- One email can produce 0 or multiple action items
- Be specific in titles — include names, amounts, and dates
- If an email has no actionable content, don't include it
- Today's date: ${new Date().toISOString().split('T')[0]}`,
          },
          {
            role: 'user',
            content: JSON.stringify(messages.map((m, i) => ({
              index: i,
              from: m.from,
              subject: m.subject,
              body: m.body,
            }))),
          },
        ],
      }),
    })

    const aiData = await aiResponse.json()
    const extracted = JSON.parse(aiData.choices[0].message.content)
    const actions = extracted.actions || []

    // Insert action items
    let inserted = 0
    for (const action of actions) {
      const sourceMsg = messages[action.email_index]
      if (!sourceMsg) continue

      const { error: insertError } = await supabase
        .from('email_action_items')
        .upsert({
          user_id: user.id,
          email_message_id: sourceMsg.id,
          email_subject: sourceMsg.subject,
          email_from: sourceMsg.from,
          email_date: new Date(sourceMsg.date).toISOString(),
          title: action.title,
          description: action.description,
          category: action.category,
          urgency: action.urgency,
          due_date: action.due_date,
          amount_cents: action.amount_cents,
          relevant_member_id: action.relevant_member_id,
          status: 'new',
        }, {
          onConflict: 'user_id,email_message_id,title',
          ignoreDuplicates: true,
        })

      if (!insertError) inserted++
    }

    // Auto-archive stale items (older than 7 days, still 'new')
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    await supabase
      .from('email_action_items')
      .update({ status: 'dismissed' })
      .eq('user_id', user.id)
      .eq('status', 'new')
      .lt('created_at', sevenDaysAgo.toISOString())

    return new Response(JSON.stringify({
      message: `Scanned ${messages.length} emails, extracted ${actions.length} actions, inserted ${inserted} new items`,
      emails_scanned: messages.length,
      actions_found: actions.length,
      items_inserted: inserted,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Email scanner error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
