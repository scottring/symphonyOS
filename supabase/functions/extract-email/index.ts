// EXTRACT-EMAIL — given a captures row (kind='email'), asks Claude for the
// events/items/todos in it and writes them via planWrites (lib/plan.ts, pure,
// tested). Parent event rows are auto-placed on their date; per-person items
// are subtasks with needed_on; the rest goes to inbox. Nothing is dropped.
// Auth: x-capture-secret. Called by inbound-email; safe to re-run by hand.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildEmailPrompt, parseEmailExtraction } from './lib/prompt.ts'
import { planWrites } from './lib/plan.ts'
import type { ExistingBlock, Member, TaskRow } from './lib/types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json() as { stop_reason?: string; content?: { type: string; text?: string }[] }
  if (data.stop_reason === 'refusal') throw new Error('Anthropic refused the request')
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

/** Today's YYYY-MM-DD on the household's wall clock. */
function todayIn(tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const g = (t: string) => p.find((x) => x.type === t)?.value
  return `${g('year')}-${g('month')}-${g('day')}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const secret = Deno.env.get('CAPTURE_SHARED_SECRET') ?? ''
  if (!secret || req.headers.get('x-capture-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  const { capture_id } = (await req.json().catch(() => ({}))) as { capture_id?: string }
  if (!capture_id) return json({ error: 'capture_id required' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: capture } = await supabase.from('captures').select('*').eq('id', capture_id).single()
  if (!capture) return json({ error: 'capture not found' }, 404)
  if (capture.kind !== 'email' || !capture.household_id) return json({ error: 'not an email capture' }, 400)

  try {
    const { data: hh } = await supabase.from('households').select('timezone').eq('id', capture.household_id).single()
    const tz = hh?.timezone ?? 'America/New_York'

    // The household roster: every family_members row owned by any active member.
    const { data: hm } = await supabase.from('household_members').select('user_id').eq('household_id', capture.household_id).eq('status', 'active')
    const userIds = (hm ?? []).map((m) => m.user_id)
    const { data: fm } = await supabase
      .from('family_members').select('id, name, role_label, member_type, display_order')
      .in('user_id', userIds).eq('member_type', 'core').order('display_order', { ascending: true })
    const seen = new Set<string>()
    const members: Member[] = (fm ?? []).flatMap((m) => {
      const key = m.name.trim().toLowerCase()
      if (seen.has(key)) return []
      seen.add(key)
      return [{ id: m.id, name: m.name, isChild: m.role_label === 'child' }]
    })

    // Existing email-derived blocks (for dedupe), with their child titles.
    const { data: blocks } = await supabase
      .from('tasks').select('id, title, scheduled_for')
      .in('user_id', userIds).not('capture_id', 'is', null).is('parent_task_id', null).eq('completed', false).not('scheduled_for', 'is', null)
    const blockIds = (blocks ?? []).map((b) => b.id)
    const { data: kids } = blockIds.length
      ? await supabase.from('tasks').select('parent_task_id, title').in('parent_task_id', blockIds)
      : { data: [] as { parent_task_id: string; title: string }[] }
    const existing: ExistingBlock[] = (blocks ?? []).map((b) => ({
      id: b.id, title: b.title,
      ymd: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(b.scheduled_for)),
      childTitles: (kids ?? []).filter((k) => k.parent_task_id === b.id).map((k) => k.title),
    }))

    const subject = capture.subject ?? '(no subject)'
    const senderLabel = capture.source_label ?? capture.sender ?? 'email'
    const body = (capture.raw_text ?? '').replace(/^Subject: .*\nFrom: .*\n\n/, '')
    const raw = await callClaude(buildEmailPrompt({ subject, sender: capture.sender ?? senderLabel, body, members, todayYmd: todayIn(tz) }), Deno.env.get('ANTHROPIC_API_KEY')!)
    const extraction = parseEmailExtraction(raw)
    const plan = planWrites({ extraction, members, todayYmd: todayIn(tz), tz, capture: { id: capture.id, user_id: capture.user_id, subject, sender_label: senderLabel }, existing })

    let children = 0
    for (const ev of plan.events) {
      let parentId: string
      if ('existingId' in ev.parent) {
        parentId = ev.parent.existingId
      } else {
        const { data, error } = await supabase.from('tasks').insert(ev.parent.row).select('id').single()
        if (error || !data) throw new Error(`parent insert failed: ${error?.message}`)
        parentId = data.id
      }
      if (ev.children.length) {
        const rows: TaskRow[] = ev.children.map((c) => ({ ...c, parent_task_id: parentId }))
        const { error } = await supabase.from('tasks').insert(rows)
        if (error) throw new Error(`subtask insert failed: ${error.message}`)
        children += rows.length
      }
    }
    if (plan.inbox.length) {
      const { error } = await supabase.from('tasks').insert(plan.inbox)
      if (error) throw new Error(`inbox insert failed: ${error.message}`)
    }
    if (plan.note) {
      const { error } = await supabase.from('notes').insert(plan.note)
      if (error) throw new Error(`note insert failed: ${error.message}`)
    }

    await supabase.from('captures').update({ status: 'extracted', error: null }).eq('id', capture.id)
    return json({ ok: true, events: plan.events.length, children, inbox: plan.inbox.length, note: !!plan.note })
  } catch (e) {
    await supabase.from('captures').update({ status: 'failed', error: String(e) }).eq('id', capture.id)
    return json({ error: String(e) }, 500)
  }
})
