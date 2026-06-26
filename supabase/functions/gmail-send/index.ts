import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ════════════════════════════════════════════════════════════════
// GMAIL SEND — Sends an email via Gmail API on behalf of the user.
//
// Used by the action queue system: when a user approves a proposed
// "send_email" action, this function executes it.
//
// Auth: Requires user JWT (sending emails is always user-initiated).
//
// Gmail scopes required:
//   - https://www.googleapis.com/auth/gmail.send
//
// To add this scope, update the scopes array in:
//   supabase/functions/google-calendar-auth-url/index.ts (line ~57)
// Then have the user disconnect + reconnect Google to re-consent.
// ════════════════════════════════════════════════════════════════

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
    .update({
      access_token: data.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'google')

  return data.access_token
}

// Encode a string to base64url (RFC 4648 section 5)
function base64urlEncode(str: string): string {
  // Encode to UTF-8 bytes, then to base64, then to base64url
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Build an RFC 2822 MIME message
function buildMimeMessage(params: {
  to: string
  subject: string
  body: string
  from?: string
  inReplyTo?: string
  references?: string
}): string {
  const lines: string[] = []

  if (params.from) {
    lines.push(`From: ${params.from}`)
  }
  lines.push(`To: ${params.to}`)
  lines.push(`Subject: ${params.subject}`)

  if (params.inReplyTo) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`)
    lines.push(`References: ${params.references || params.inReplyTo}`)
  }

  lines.push('Content-Type: text/plain; charset=utf-8')
  lines.push('MIME-Version: 1.0')
  lines.push('') // Blank line separates headers from body
  lines.push(params.body)

  return lines.join('\r\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth — requires user JWT
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

    // Parse request body. mode 'draft' (default for action-queue) creates a
    // Gmail draft the user reviews + sends themselves — nothing leaves the
    // outbox automatically. mode 'send' actually sends (explicit, user-initiated).
    const { to, subject, body, threadId, inReplyTo, mode } = await req.json()
    const sendMode: 'send' | 'draft' = mode === 'draft' ? 'draft' : 'send'

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get Google OAuth tokens
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: connection, error: connError } = await supabaseAdmin
      .from('calendar_connections')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single()

    if (connError || !connection?.refresh_token) {
      return new Response(JSON.stringify({
        error: 'No Google connection found. Connect Google with Gmail send scope.',
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
      accessToken = await refreshAccessToken(supabaseAdmin, user.id, connection.refresh_token)
    }

    // Get user's email address for the From header
    const profileRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const profile = await profileRes.json()

    if (profile.error) {
      throw new Error(`Gmail profile fetch failed: ${JSON.stringify(profile.error)}`)
    }

    const fromEmail = profile.emailAddress

    // Build MIME message
    const mimeMessage = buildMimeMessage({
      from: fromEmail,
      to,
      subject,
      body,
      inReplyTo: inReplyTo || undefined,
    })

    // Base64url encode the MIME message
    const encodedMessage = base64urlEncode(mimeMessage)

    const message: Record<string, string> = { raw: encodedMessage }
    if (threadId) {
      message.threadId = threadId
    }

    // DRAFT mode: create a Gmail draft (drafts.create). Safe — never sends.
    if (sendMode === 'draft') {
      const draftRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message }),
        }
      )
      const draftData = await draftRes.json()
      if (draftData.error) {
        return new Response(JSON.stringify({
          error: `Gmail draft failed: ${draftData.error.message || JSON.stringify(draftData.error)}`,
        }), {
          status: draftRes.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        success: true,
        mode: 'draft',
        draftId: draftData.id,
        messageId: draftData.message?.id,
        threadId: draftData.message?.threadId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // SEND mode: actually send (explicit, user-initiated).
    const sendRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    )

    const sendData = await sendRes.json()

    if (sendData.error) {
      return new Response(JSON.stringify({
        error: `Gmail send failed: ${sendData.error.message || JSON.stringify(sendData.error)}`,
      }), {
        status: sendRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      mode: 'send',
      messageId: sendData.id,
      threadId: sendData.threadId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Gmail send error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
