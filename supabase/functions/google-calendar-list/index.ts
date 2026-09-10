// Lists calendars across EVERY provider the user has connected. Outlook
// calendars come back with accessRole 'reader' — reads only for now — which
// is the signal the event panel already uses to hide edits.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  openConnections,
  readProviderEnv,
  type CalendarConnectionRow,
} from '../_shared/calendar-providers/index.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

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
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: connections, error: connError } = await supabaseAdmin
      .from('calendar_connections')
      .select('user_id, provider, access_token, refresh_token, token_expires_at, calendar_id')
      .eq('user_id', user.id)

    if (connError || !connections || connections.length === 0) {
      return json({ error: 'No calendar connection found' }, 404)
    }

    const opened = await openConnections(
      supabaseAdmin,
      connections as CalendarConnectionRow[],
      readProviderEnv((n) => Deno.env.get(n)),
    )

    // A permanently revoked grant: drop that provider's row so the app shows
    // "reconnect" for it rather than failing forever. Other providers keep working.
    for (const err of opened.errors) {
      if (err.needsReconnect) {
        await supabaseAdmin
          .from('calendar_connections')
          .delete()
          .eq('user_id', user.id)
          .eq('provider', err.provider)
      }
    }

    if (opened.calendars.length === 0 && opened.errors.length > 0) {
      const worst = opened.errors.find((e) => e.needsReconnect) ?? opened.errors[0]
      return json({ error: worst.message, needsReconnect: worst.needsReconnect, providerErrors: opened.errors }, 401)
    }

    return json({ calendars: opened.calendars, providerErrors: opened.errors })
  } catch (error) {
    console.error('Error fetching calendar list:', error)
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})
