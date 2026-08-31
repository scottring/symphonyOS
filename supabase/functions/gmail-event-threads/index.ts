import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildSearchQueries, clampMaxResults } from '../_shared/gmail-tools.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ════════════════════════════════════════════════════════════════
// GMAIL EVENT THREADS — Fetches email threads related to calendar
// event attendees, enabling contextual email display on events.
//
// Three modes:
//   1. Search by attendee: POST { attendeeEmails: string[] } → threads
//   2. Search by query:    POST { query: string } → threads
//        A raw Gmail query ("potluck newer_than:30d"). Used by the
//        assistant's symphony_search_email tool.
//   3. Detail: POST { threadId: string } → full thread with bodies
//
// Both search modes also return `mailbox` — the address actually
// searched — so a caller can never report "nothing found" without
// saying which account it looked in.
//
// Auth: Requires user JWT via Authorization header.
//
// Gmail scopes required:
//   - https://www.googleapis.com/auth/gmail.readonly
// ════════════════════════════════════════════════════════════════

interface ThreadMetadata {
  threadId: string
  subject: string
  snippet: string
  lastMessageDate: string
  from: string
  messageCount: number
}

interface ThreadMessage {
  from: string
  to: string
  date: string
  body: string
}

interface ThreadDetail extends ThreadMetadata {
  messages: ThreadMessage[]
}

// Decode base64url encoded content from Gmail
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  return atob(base64)
}

// Extract plain text body from Gmail message payload
function extractBodyFromPayload(payload: {
  body?: { data?: string }
  parts?: Array<{
    mimeType: string
    body?: { data?: string }
    parts?: Array<{ mimeType: string; body?: { data?: string } }>
  }>
  mimeType?: string
}): string {
  // Simple body
  if (payload.body?.data) {
    if (!payload.mimeType || payload.mimeType === 'text/plain') {
      return decodeBase64Url(payload.body.data)
    }
    if (payload.mimeType === 'text/html') {
      const html = decodeBase64Url(payload.body.data)
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
  }

  // Multipart — find text/plain first, then fall back to text/html
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
    // Fallback to HTML with tags stripped
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64Url(part.body.data)
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
  }

  return ''
}

// Get header value from Gmail message headers
function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string
): string {
  const header = headers.find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )
  return header?.value || ''
}

// Refresh Google access token (same pattern as gmail-check)
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

// The address of the mailbox these tokens belong to. Symphony holds exactly
// one Google connection per user (calendar_connections is UNIQUE on
// user_id+provider), so "which inbox did you search?" has one answer — and
// callers must be able to state it.
async function fetchMailboxAddress(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()
    return data?.emailAddress ?? null
  } catch (err) {
    console.error('Gmail profile fetch failed:', err)
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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

    const body = await req.json()

    // ── Mode 2: Fetch full thread detail ────────────────────────
    if (body.threadId) {
      const threadUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${body.threadId}?format=full`
      const threadRes = await fetch(threadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const threadData = await threadRes.json()

      if (threadData.error) {
        if (threadData.error.code === 403) {
          return new Response(JSON.stringify({
            error: 'Gmail access not authorized. Disconnect and reconnect Google to grant email permissions.',
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        throw new Error(`Gmail thread fetch failed: ${JSON.stringify(threadData.error)}`)
      }

      const messages: ThreadMessage[] = (threadData.messages || []).map(
        (msg: { payload: { headers: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: Array<{ mimeType: string; body?: { data?: string } }> }>; mimeType?: string } }) => ({
          from: getHeader(msg.payload.headers, 'From'),
          to: getHeader(msg.payload.headers, 'To'),
          date: getHeader(msg.payload.headers, 'Date'),
          body: extractBodyFromPayload(msg.payload).slice(0, 5000),
        })
      )

      const firstMsg = threadData.messages?.[0]
      const lastMsg = threadData.messages?.[threadData.messages.length - 1]

      const thread: ThreadDetail = {
        threadId: threadData.id,
        subject: firstMsg ? getHeader(firstMsg.payload.headers, 'Subject') : '',
        snippet: threadData.snippet || '',
        lastMessageDate: lastMsg ? getHeader(lastMsg.payload.headers, 'Date') : '',
        from: firstMsg ? getHeader(firstMsg.payload.headers, 'From') : '',
        messageCount: threadData.messages?.length || 0,
        messages,
      }

      return new Response(JSON.stringify({ thread }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Modes 1 & 2: Search threads ─────────────────────────────
    // A raw Gmail query wins when present; otherwise attendee addresses are
    // expanded into from:/to: queries (the original calendar-event behavior).
    const maxResults = clampMaxResults(body.maxResults)
    const queries = buildSearchQueries(body)

    const mailbox = await fetchMailboxAddress(accessToken)

    if (queries.length === 0) {
      return new Response(JSON.stringify({ threads: [], mailbox }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const seenThreadIds = new Set<string>()
    const allThreads: ThreadMetadata[] = []

    for (const query of queries) {
      const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
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
        console.error(`Gmail search failed for query "${query}":`, searchData.error)
        continue
      }

      const threadRefs = searchData.threads || []

      for (const ref of threadRefs as Array<{ id: string }>) {
        if (seenThreadIds.has(ref.id)) continue
        seenThreadIds.add(ref.id)

        // Fetch thread metadata
        const threadUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`
        const threadRes = await fetch(threadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const threadData = await threadRes.json()

        if (threadData.error) {
          console.error(`Thread metadata fetch failed for ${ref.id}:`, threadData.error)
          continue
        }

        const firstMsg = threadData.messages?.[0]
        const lastMsg = threadData.messages?.[threadData.messages.length - 1]

        if (!firstMsg) continue

        allThreads.push({
          threadId: threadData.id,
          subject: getHeader(firstMsg.payload.headers, 'Subject'),
          snippet: threadData.snippet || '',
          lastMessageDate: lastMsg
            ? getHeader(lastMsg.payload.headers, 'Date')
            : getHeader(firstMsg.payload.headers, 'Date'),
          from: getHeader(firstMsg.payload.headers, 'From'),
          messageCount: threadData.messages?.length || 0,
        })
      }
    }

    // Sort by most recent first
    allThreads.sort((a, b) => {
      const dateA = new Date(a.lastMessageDate).getTime() || 0
      const dateB = new Date(b.lastMessageDate).getTime() || 0
      return dateB - dateA
    })

    return new Response(JSON.stringify({ threads: allThreads, mailbox }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Gmail event threads error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
