const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WaitlistPayload {
  type: 'INSERT'
  table: 'waitlist'
  record: {
    id: string
    email: string
    created_at: string
    source: string
    status: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured')
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const notifyEmail = Deno.env.get('WAITLIST_NOTIFY_EMAIL')
    if (!notifyEmail) {
      console.error('WAITLIST_NOTIFY_EMAIL not configured')
      return new Response(JSON.stringify({ error: 'Notification email not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload: WaitlistPayload = await req.json()
    const { record } = payload

    if (!record?.email) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const signupDate = new Date(record.created_at).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Symphony OS <notifications@symphonyos.app>',
        to: [notifyEmail],
        subject: `New waitlist signup: ${record.email}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2d5a27; margin-bottom: 20px;">New Waitlist Signup</h2>

            <div style="background: #f8f7f4; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
              <p style="margin: 0 0 12px 0;"><strong>Email:</strong> <a href="mailto:${record.email}" style="color: #2d5a27;">${record.email}</a></p>
              <p style="margin: 0 0 12px 0;"><strong>Source:</strong> ${record.source}</p>
              <p style="margin: 0;"><strong>Signed up:</strong> ${signupDate}</p>
            </div>

            <p style="color: #666; font-size: 14px;">
              View and manage all waitlist signups in your <a href="https://symphonyos.app/settings" style="color: #2d5a27;">admin dashboard</a>.
            </p>
          </div>
        `,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      console.error('Resend API error:', errorText)
      return new Response(JSON.stringify({ error: 'Failed to send email', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = await emailResponse.json()
    console.log('Notification sent successfully:', result.id)

    return new Response(JSON.stringify({ success: true, emailId: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in waitlist-signup-notify:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
