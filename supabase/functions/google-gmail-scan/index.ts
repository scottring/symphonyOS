import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Custom error class for token refresh failures
class TokenRefreshError extends Error {
  constructor(message: string, public readonly shouldDisconnect: boolean = false) {
    super(message)
    this.name = 'TokenRefreshError'
  }
}

interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
    body?: { data?: string }
    parts?: Array<{ body?: { data?: string }; mimeType?: string }>
  }
  internalDate?: string
}

interface FlaggedEmail {
  gmail_id: string
  thread_id: string
  from: string
  from_email: string
  subject: string
  snippet: string
  received_at: string
  importance: 'high' | 'medium'
  suggested_task_title: string
  reason: string
}

async function refreshAccessToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const tokenData = await tokenResponse.json()

  if (tokenData.error) {
    const permanentErrors = ['invalid_grant', 'invalid_client', 'unauthorized_client']
    const shouldDisconnect = permanentErrors.includes(tokenData.error)
    const message = tokenData.error_description || tokenData.error
    throw new TokenRefreshError(message, shouldDisconnect)
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  await supabaseAdmin
    .from('calendar_connections')
    .update({
      access_token: tokenData.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'google')

  return tokenData.access_token
}

function extractHeader(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  if (!headers) return ''
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase())
  return header?.value || ''
}

function parseFromHeader(fromHeader: string): { name: string; email: string } {
  // Format: "Name <email@example.com>" or just "email@example.com"
  const match = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/)
  if (match) {
    return {
      name: (match[1] || '').trim() || match[2],
      email: match[2].trim(),
    }
  }
  return { name: fromHeader, email: fromHeader }
}

const SYSTEM_PROMPT = `You are an email triage assistant for a busy family. Your job is to identify emails that require attention or action.

FLAG emails that:
1. Require a response or action (requests, questions, invoices, appointments)
2. Are from important contacts (family, doctors, schools, work colleagues)
3. Have time-sensitive content (deadlines, confirmations, reminders)
4. Are personal/direct messages (not bulk/marketing)

DO NOT flag:
- Marketing emails, newsletters, promotions
- Automated notifications that don't need action
- Social media updates
- Spam or obvious junk
- Receipts that don't require action
- Read receipts or delivery confirmations

For each flagged email, provide:
1. importance: "high" (urgent/time-sensitive) or "medium" (needs attention but not urgent)
2. suggested_task_title: A clear, actionable task title (e.g., "Reply to Dr. Smith about appointment", "Pay invoice from ABC Corp", "RSVP to Sarah's party")
3. reason: Brief explanation of why this needs attention

Respond with a JSON object:
{
  "flagged": [
    {
      "gmail_id": "message id",
      "importance": "high" | "medium",
      "suggested_task_title": "actionable task title",
      "reason": "why this needs attention"
    }
  ],
  "summary": "Brief summary of what was found"
}

Return only valid JSON.`

serve(async (req) => {
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

    // Get user's calendar/gmail connection (shared OAuth)
    const { data: connection, error: connError } = await supabaseAdmin
      .from('calendar_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single()

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'No Google connection found. Please connect Google Calendar first.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if token needs refresh
    let accessToken = connection.access_token
    const expiresAt = new Date(connection.token_expires_at)
    const now = new Date()
    const fiveMinutes = 5 * 60 * 1000

    if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
      try {
        accessToken = await refreshAccessToken(supabaseAdmin, user.id, connection.refresh_token)
      } catch (err) {
        if (err instanceof TokenRefreshError) {
          return new Response(JSON.stringify({
            error: err.message,
            errorCode: 'invalid_grant',
            needsReconnect: err.shouldDisconnect,
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        throw err
      }
    }

    // Get already-processed email IDs to exclude
    const { data: processedEmails } = await supabaseAdmin
      .from('gmail_processed_emails')
      .select('gmail_message_id')
      .eq('user_id', user.id)

    const processedIds = new Set((processedEmails || []).map(e => e.gmail_message_id))

    // Fetch recent emails from Gmail API (last 48 hours, max 30)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const query = `is:unread OR is:important after:${Math.floor(twoDaysAgo.getTime() / 1000)}`

    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    listUrl.searchParams.set('q', query)
    listUrl.searchParams.set('maxResults', '30')

    const listResponse = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!listResponse.ok) {
      const errorData = await listResponse.json()
      console.error('Gmail API error:', JSON.stringify(errorData, null, 2))

      // Check for permission error (Gmail scope not granted or API not enabled)
      if (errorData.error?.code === 403 || errorData.error?.status === 'PERMISSION_DENIED') {
        const errorMessage = errorData.error?.message || ''
        const isApiNotEnabled = errorMessage.includes('Gmail API has not been used') ||
                                errorMessage.includes('is not enabled') ||
                                errorMessage.includes('accessNotConfigured')

        return new Response(JSON.stringify({
          error: isApiNotEnabled
            ? 'Gmail API is not enabled in Google Cloud Console. Please enable it and try again.'
            : 'Gmail access not granted. Please reconnect Google to enable email scanning.',
          needsReconnect: !isApiNotEnabled,
          apiNotEnabled: isApiNotEnabled,
          details: errorMessage,
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ error: errorData.error?.message || 'Failed to fetch emails' }), {
        status: listResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const listData = await listResponse.json()
    const messageIds: string[] = (listData.messages || []).map((m: { id: string }) => m.id)

    if (messageIds.length === 0) {
      return new Response(JSON.stringify({
        emails: [],
        summary: 'No recent emails to analyze.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Filter out already-processed emails
    const newMessageIds = messageIds.filter(id => !processedIds.has(id))

    if (newMessageIds.length === 0) {
      return new Response(JSON.stringify({
        emails: [],
        summary: 'All recent emails have already been processed.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch full message details (batch in parallel)
    const messagePromises = newMessageIds.slice(0, 20).map(async (id) => {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
      const response = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!response.ok) return null
      return response.json() as Promise<GmailMessage>
    })

    const messages = (await Promise.all(messagePromises)).filter(Boolean) as GmailMessage[]

    if (messages.length === 0) {
      return new Response(JSON.stringify({
        emails: [],
        summary: 'Could not fetch email details.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get user's contacts for AI context
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('name, email')
      .eq('user_id', user.id)
      .limit(50)

    const contactEmails = (contacts || [])
      .filter(c => c.email)
      .map(c => c.email!.toLowerCase())

    // Format emails for AI analysis
    const emailSummaries = messages.map(msg => {
      const headers = msg.payload?.headers || []
      const fromHeader = extractHeader(headers, 'From')
      const { name, email } = parseFromHeader(fromHeader)
      const subject = extractHeader(headers, 'Subject')
      const date = extractHeader(headers, 'Date')
      const isKnownContact = contactEmails.includes(email.toLowerCase())
      const isImportant = msg.labelIds?.includes('IMPORTANT') || false
      const isUnread = msg.labelIds?.includes('UNREAD') || false

      return {
        gmail_id: msg.id,
        from_name: name,
        from_email: email,
        subject: subject || '(No subject)',
        snippet: msg.snippet || '',
        date,
        is_known_contact: isKnownContact,
        is_important: isImportant,
        is_unread: isUnread,
      }
    })

    // Call Claude to analyze emails
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const userPrompt = `Analyze these ${emailSummaries.length} emails and identify which ones need attention:

${emailSummaries.map((e, i) => `
[${i + 1}] ID: ${e.gmail_id}
From: ${e.from_name} <${e.from_email}>${e.is_known_contact ? ' (KNOWN CONTACT)' : ''}
Subject: ${e.subject}
Preview: ${e.snippet}
Flags: ${[e.is_important ? 'IMPORTANT' : '', e.is_unread ? 'UNREAD' : ''].filter(Boolean).join(', ') || 'none'}
`).join('\n')}

Return JSON with flagged emails only. If none need attention, return {"flagged": [], "summary": "..."}`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!claudeResponse.ok) {
      const errorData = await claudeResponse.json()
      console.error('Claude API error:', errorData)
      throw new Error('AI analysis failed')
    }

    const claudeData = await claudeResponse.json()
    const responseText = claudeData.content?.[0]?.text || '{}'

    // Parse AI response
    let aiResult: { flagged: Array<{ gmail_id: string; importance: 'high' | 'medium'; suggested_task_title: string; reason: string }>; summary: string }
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      aiResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { flagged: [], summary: 'Could not parse AI response' }
    } catch {
      console.error('Failed to parse AI response:', responseText)
      aiResult = { flagged: [], summary: 'AI response parsing failed' }
    }

    // Enrich flagged emails with full details
    const flaggedEmails: FlaggedEmail[] = aiResult.flagged.map(f => {
      const emailData = emailSummaries.find(e => e.gmail_id === f.gmail_id)
      if (!emailData) return null

      return {
        gmail_id: f.gmail_id,
        thread_id: messages.find(m => m.id === f.gmail_id)?.threadId || '',
        from: emailData.from_name,
        from_email: emailData.from_email,
        subject: emailData.subject,
        snippet: emailData.snippet,
        received_at: emailData.date,
        importance: f.importance,
        suggested_task_title: f.suggested_task_title,
        reason: f.reason,
      }
    }).filter(Boolean) as FlaggedEmail[]

    return new Response(JSON.stringify({
      emails: flaggedEmails,
      summary: aiResult.summary,
      total_scanned: emailSummaries.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in google-gmail-scan:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
