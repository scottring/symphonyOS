import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody { tokenId: string }

interface InverseAction {
  type: 'delete_meal_plan_entries_by_ids' | 'restore_meal_plan_entries' | 'restore_weekly_brief_status' | string
  payload: Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError(401, 'missing authorization')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { tokenId } = (await req.json()) as RequestBody
    if (!tokenId) return jsonError(400, 'tokenId required')

    const { data: token, error: tokErr } = await supabase
      .from('ai_undo_tokens').select('*').eq('id', tokenId).maybeSingle()
    if (tokErr || !token) return jsonError(404, 'token not found')

    if (token.used_at) {
      return new Response(JSON.stringify({ ok: true, noop: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (new Date(token.expires_at) < new Date()) {
      return jsonError(410, 'token expired')
    }

    // Optimistic-lock claim: only one caller can transition used_at: null → now().
    // A racing second caller will receive zero rows back and treat it as noop.
    const claimedAt = new Date().toISOString()
    const { data: claimed, error: claimErr } = await supabase
      .from('ai_undo_tokens')
      .update({ used_at: claimedAt })
      .eq('id', tokenId)
      .is('used_at', null)
      .select('id')
    if (claimErr) return jsonError(500, `claim failed: ${claimErr.message}`)
    if (!claimed || claimed.length === 0) {
      // Another caller won the race — treat as idempotent success.
      return new Response(JSON.stringify({ ok: true, noop: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const actions = (token.inverse_actions ?? []) as InverseAction[]
    for (const action of actions) {
      if (action.type === 'delete_meal_plan_entries_by_ids') {
        const ids = (action.payload?.ids ?? []) as string[]
        if (ids.length > 0) {
          const { error } = await supabase.from('meal_plan_entries').delete().in('id', ids)
          if (error) return jsonError(500, `delete failed: ${error.message}`)
        }
      } else if (action.type === 'restore_meal_plan_entries') {
        const rows = (action.payload?.rows ?? []) as Record<string, unknown>[]
        if (rows.length > 0) {
          // Restore by the original row shape; the ids come back too.
          const { error } = await supabase.from('meal_plan_entries').insert(rows)
          if (error) return jsonError(500, `restore failed: ${error.message}`)
        }
      } else if (action.type === 'restore_weekly_brief_status') {
        const briefId = action.payload?.brief_id as string | undefined
        const status = action.payload?.status as string | null | undefined
        const generatedAt = action.payload?.generated_at as string | null | undefined
        if (briefId) {
          const { error } = await supabase
            .from('weekly_briefs')
            .update({
              status: status ?? 'draft',
              generated_at: generatedAt ?? null,
            })
            .eq('id', briefId)
          if (error) return jsonError(500, `restore brief failed: ${error.message}`)
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, noop: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(500, `unexpected: ${e instanceof Error ? e.message : String(e)}`)
  }
})

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
