import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendSmsRequest {
  to: string // E.164 format: +15551234567
  message: string
  // Optional: for logging
  recipientName?: string
  recipientContactId?: string
  originalInput?: string
  aiDraft?: string
  aiConfidence?: number
}

interface SendSmsResponse {
  success: boolean
  sid?: string // Twilio message SID
  actionLogId?: string
  error?: string
}

// Validate E.164 phone number format
function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone)
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
      message,
      recipientName,
      recipientContactId,
      originalInput,
      aiDraft,
      aiConfidence,
    }: SendSmsRequest = await req.json()

    // Validate inputs
    if (!to || !message) {
      return new Response(JSON.stringify({ error: 'Phone number and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!isValidE164(to)) {
      return new Response(JSON.stringify({
        error: 'Invalid phone number format. Must be E.164 format (e.g., +15551234567)'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get Twilio credentials
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!accountSid || !authToken || !fromNumber) {
      console.error('Twilio credentials not configured')
      return new Response(JSON.stringify({ error: 'SMS service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
        action_type: 'sms',
        status: 'confirmed',
        recipient_contact_id: recipientContactId || null,
        recipient_name: recipientName || to,
        recipient_phone: to,
        original_input: originalInput || message,
        ai_draft: aiDraft || null,
        final_message: message,
        ai_confidence: aiConfidence || null,
        ai_model: aiConfidence ? 'claude-3-5-haiku-20241022' : null,
      })
      .select()
      .single()

    if (logError) {
      console.error('Failed to create action log:', logError)
      // Continue anyway - sending is more important than logging
    }

    // Send SMS via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const twilioAuth = btoa(`${accountSid}:${authToken}`)

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${twilioAuth}`,
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: message,
      }),
    })

    const twilioResult = await twilioResponse.json()

    if (!twilioResponse.ok) {
      console.error('Twilio error:', twilioResult)

      // Update action log with error
      if (actionLog?.id) {
        await supabaseAdmin
          .from('action_logs')
          .update({
            status: 'failed',
            error: twilioResult.message || twilioResult.error_message || 'SMS send failed',
          })
          .eq('id', actionLog.id)
      }

      return new Response(JSON.stringify({
        success: false,
        error: twilioResult.message || 'Failed to send SMS',
        actionLogId: actionLog?.id,
      }), {
        status: twilioResponse.status,
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
          twilio_sid: twilioResult.sid,
        })
        .eq('id', actionLog.id)
    }

    console.log('SMS sent successfully:', {
      to,
      sid: twilioResult.sid,
      actionLogId: actionLog?.id,
    })

    const response: SendSmsResponse = {
      success: true,
      sid: twilioResult.sid,
      actionLogId: actionLog?.id,
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-sms error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
