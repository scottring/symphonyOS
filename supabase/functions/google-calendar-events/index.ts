// Reads events across EVERY calendar provider the user has connected (Google,
// Outlook via Microsoft Graph) and returns them in one merged list. The name
// is historical — the frontend calls this one function for all calendars.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  fetchEventsAcross,
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

    const { startDate, endDate, domain } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Every provider this user has connected — one row per provider.
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

    // Every provider failed: surface it the way the single-provider path
    // always has, so the hook's reconnect handling is unchanged.
    if (opened.calendars.length === 0 && opened.errors.length > 0) {
      const worst = opened.errors.find((e) => e.needsReconnect) ?? opened.errors[0]
      return json(
        { error: worst.message, errorCode: worst.needsReconnect ? 'invalid_grant' : undefined, needsReconnect: worst.needsReconnect, providerErrors: opened.errors },
        401,
      )
    }

    let calendars = opened.calendars

    // Get all of this user's calendar domain mappings
    const { data: allMappings, error: mappingsError } = await supabaseAdmin
      .from('calendar_domain_mappings')
      .select('calendar_id, domain')
      .eq('user_id', user.id)

    if (mappingsError) {
      console.error('Error fetching calendar domain mappings:', mappingsError)
    }

    const hasMappings = allMappings && allMappings.length > 0

    if (domain === 'all') {
      // 'all' = no filtering, show every calendar (used by kiosk/wall view)
      console.log(`Fetching events from all ${calendars.length} calendars (domain: all)`)
    } else if (domain && domain !== 'universal') {
      // Specific domain: only show calendars mapped to this domain
      if (!hasMappings) {
        console.log(`No calendars assigned to domain: ${domain}`)
        return json({ events: [], providerErrors: opened.errors })
      }

      const domainCalendarIds = new Set(
        allMappings.filter(m => m.domain === domain).map(m => m.calendar_id)
      )

      if (domainCalendarIds.size === 0) {
        console.log(`No calendars assigned to domain: ${domain}`)
        return json({ events: [], providerErrors: opened.errors })
      }

      calendars = calendars.filter(c => domainCalendarIds.has(c.id))
      console.log(`Fetching events for domain "${domain}" from ${calendars.length} assigned calendars`)
    } else if (hasMappings) {
      // Universal/unspecified domain BUT user has mappings configured:
      // Only show calendars that have been mapped to ANY domain.
      // This prevents shared calendars (e.g. a partner's work calendar)
      // from leaking into the user's view if they haven't explicitly mapped them.
      const allMappedCalendarIds = new Set(allMappings.map(m => m.calendar_id))
      const mapped = calendars.filter(c => allMappedCalendarIds.has(c.id))
      if (mapped.length === 0) {
        // Safety net: the mappings don't match ANY of this account's calendars
        // (e.g. stale mappings left over from a previously-connected account).
        // Rather than silently return zero events, show everything —
        // a blank "universal" view is never the right answer.
        console.log(`Mappings match no current calendars; falling back to all ${calendars.length} calendars (domain: universal)`)
      } else {
        calendars = mapped
        console.log(`Fetching events from ${calendars.length} mapped calendars (domain: universal)`)
      }
    } else {
      // No mappings at all: show all calendars (first-time / unconfigured user)
      console.log(`Fetching events from all ${calendars.length} calendars (no domain mappings configured)`)
    }

    console.log('Fetching events from calendars:', calendars.map(c => ({ provider: c.provider, id: c.id, summary: c.summary })))

    const events = await fetchEventsAcross(opened, calendars, user.id, {
      start: new Date(startDate).toISOString(),
      end: new Date(endDate).toISOString(),
    })

    // Upsert events to cache. `provider` is not a column there; strip it.
    if (events.length > 0) {
      const rows = events.map(({ provider: _provider, ...row }) => row)
      const { error: upsertError } = await supabaseAdmin
        .from('calendar_events')
        .upsert(rows, { onConflict: 'user_id,google_event_id' })

      if (upsertError) {
        console.error('Failed to cache events:', upsertError)
      }
    }

    return json({ events, providerErrors: opened.errors })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
