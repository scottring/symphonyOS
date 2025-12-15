import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendEmailRequest {
  to: string // Email address
  subject: string
  body: string // Plain text or HTML
  // Optional: for logging
  recipientName?: string
  recipientContactId?: string
  originalInput?: string
  aiDraft?: string
  aiConfidence?: number
}

interface SendEmailResponse {
  success: boolean
  id?: string // Resend message ID
  actionLogId?: string
  error?: string
}

// Basic email validation
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    const {
      to,
      subject,
      body,
      recipientName,
      recipientContactId,
      originalInput,
      aiDraft,
      aiConfidence,
    }: SendEmailRequest = await req.json()

    // Validate inputs
    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Email address, subject, and body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!isValidEmail(to)) {
      return new Response(JSON.stringify({ error: 'Invalid email address format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get Resend API key
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured')
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the sender email - for user emails, we need a verified domain
    // Using a generic sender with reply-to for now
    const senderEmail = Deno.env.get('USER_EMAIL_FROM') || 'Symphony OS <noreply@symphonyos.app>'

    // Create admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Create action log entry first (status: confirmed)
    const { data: actionLog, error: logError } = await supabaseAdmin
      .from('action_logs')
      .insert({
        user_id: user.id,
        action_type: 'email',
        status: 'confirmed',
        recipient_contact_id: recipientContactId || null,
        recipient_name: recipientName || to,
        recipient_email: to,
        original_input: originalInput || `${subject}: ${body}`,
        ai_draft: aiDraft || null,
        final_message: body,
        subject: subject,
        ai_confidence: aiConfidence || null,
        ai_model: aiConfidence ? 'claude-3-5-haiku-20241022' : null,
      })
      .select()
      .single()

    if (logError) {
      console.error('Failed to create action log:', logError)
      // Continue anyway - sending is more important than logging
    }

    // Convert plain text to simple HTML if needed
    const htmlBody = body.includes('<') && body.includes('>')
      ? body // Already HTML
      : `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; white-space: pre-wrap;">${body.replace(/\n/g, '<br>')}</div>`

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: senderEmail,
        to: [to],
        subject: subject,
        html: htmlBody,
        text: body, // Plain text fallback
      }),
    })

    const emailResult = await emailResponse.json()

    if (!emailResponse.ok) {
      console.error('Resend error:', emailResult)

      // Update action log with error
      if (actionLog?.id) {
        await supabaseAdmin
          .from('action_logs')
          .update({
            status: 'failed',
            error: emailResult.message || 'Email send failed',
          })
          .eq('id', actionLog.id)
      }

      return new Response(JSON.stringify({
        success: false,
        error: emailResult.message || 'Failed to send email',
        actionLogId: actionLog?.id,
      }), {
        status: emailResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update action log with success
    if (actionLog?.id) {
      await supabaseAdmin
        .from('action_logs')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          resend_id: emailResult.id,
        })
        .eq('id', actionLog.id)
    }

    console.log('Email sent successfully:', {
      to,
      id: emailResult.id,
      actionLogId: actionLog?.id,
    })

    const response: SendEmailResponse = {
      success: true,
      id: emailResult.id,
      actionLogId: actionLog?.id,
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-email error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
