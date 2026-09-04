// EXTRACT-EMAIL — given a captures row (kind='email'), asks Claude for the
// events/items/todos in it and writes them via planWrites (lib/plan.ts, pure,
// tested). Parent event rows are auto-placed on their date; per-person items
// are subtasks with needed_on; the rest goes to inbox. Nothing is dropped.
// Auth: x-capture-secret. Called by inbound-email; safe to re-run by hand.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildEmailPrompt, parseEmailExtraction } from './lib/prompt.ts'
import { planWrites, itemsMatch, sameAudience, type MailRowAudience } from './lib/plan.ts'
import { addDays, zonedIso } from './lib/dates.ts'
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

/** Characters of the email body that reach the prompt; the rest is cut. */
const MAX_PROMPT_BODY = 60_000
/** How far back a mail-born task or notice counts as "already have it". */
const DEDUPE_WINDOW_DAYS = 14

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
  const { data: capture, error: captureError } = await supabase.from('captures').select('*').eq('id', capture_id).maybeSingle()
  if (captureError) return json({ error: `db: ${captureError.message}` }, 500)
  if (!capture) return json({ error: 'capture not found' }, 404)
  if (capture.kind !== 'email' || !capture.household_id) {
    await supabase.from('captures').update({ status: 'failed', error: 'not an email capture' }).eq('id', capture.id)
    return json({ error: 'not an email capture' }, 400)
  }

  try {
    const { data: hh, error: hhError } = await supabase.from('households').select('timezone').eq('id', capture.household_id).single()
    if (hhError) throw new Error(`households read failed: ${hhError.message}`)
    const tz = hh?.timezone ?? 'America/New_York'
    const todayYmd = todayIn(tz)

    // The household roster: every family_members row owned by any active member.
    const { data: hm, error: hmError } = await supabase.from('household_members').select('user_id').eq('household_id', capture.household_id).eq('status', 'active')
    if (hmError) throw new Error(`household_members read failed: ${hmError.message}`)
    const userIds = (hm ?? []).map((m) => m.user_id)
    if (userIds.length === 0) throw new Error('household has no active members')
    const { data: fm, error: fmError } = await supabase
      .from('family_members').select('id, name, role_label, member_type, display_order, is_full_user')
      .in('user_id', userIds).eq('member_type', 'core').order('display_order', { ascending: true })
    if (fmError) throw new Error(`family_members read failed: ${fmError.message}`)
    const seen = new Set<string>()
    const members: Member[] = (fm ?? []).flatMap((m) => {
      const key = m.name.trim().toLowerCase()
      if (seen.has(key)) return []
      seen.add(key)
      // Households label children inconsistently ('child', 'family', null).
      // A parent is labelled 'parent' or holds a login; everyone else is a child.
      const isChild = m.role_label === 'child' ? true : m.role_label === 'parent' ? false : !m.is_full_user
      return [{ id: m.id, name: m.name, isChild }]
    })

    // Existing email-derived blocks (for dedupe), with their child titles.
    // Bounded on purpose: dedupe only ever compares against dates an email
    // could plausibly name — from two days back (late-arriving mail places on
    // yesterday) to a year out — so this never grows into a full-table read.
    const { data: blocks, error: blocksError } = await supabase
      .from('tasks').select('id, title, scheduled_for')
      .in('user_id', userIds).not('capture_id', 'is', null).is('parent_task_id', null).eq('completed', false).not('scheduled_for', 'is', null)
      .gte('scheduled_for', zonedIso(addDays(todayYmd, -2), null, tz))
      .lte('scheduled_for', zonedIso(addDays(todayYmd, 366), null, tz))
      .limit(500)
    if (blocksError) throw new Error(`tasks (blocks) read failed: ${blocksError.message}`)
    const blockIds = (blocks ?? []).map((b) => b.id)
    const { data: kids, error: kidsError } = blockIds.length
      ? await supabase.from('tasks').select('parent_task_id, title').in('parent_task_id', blockIds).limit(2000)
      : { data: [] as { parent_task_id: string; title: string }[], error: null }
    if (kidsError) throw new Error(`tasks (children) read failed: ${kidsError.message}`)
    const existing: ExistingBlock[] = (blocks ?? []).map((b) => ({
      id: b.id, title: b.title,
      ymd: new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(b.scheduled_for)),
      childTitles: (kids ?? []).filter((k) => k.parent_task_id === b.id).map((k) => k.title),
    }))

    const subject = capture.subject ?? '(no subject)'
    const senderLabel = capture.source_label ?? capture.sender ?? 'email'
    const fullBody = (capture.raw_text ?? '').replace(/^Subject: .*\nFrom: .*\n\n/, '')
    // The prompt has to fit the model's window and the whole email is rarely
    // the actionable part. Keep the head, and tell the model it was cut so it
    // reports a truncated gap instead of silently losing the tail.
    const truncated = fullBody.length > MAX_PROMPT_BODY
    const body = truncated
      ? `${fullBody.slice(0, MAX_PROMPT_BODY)}\n\n[TRUNCATED — the email was longer than what could be read]`
      : fullBody
    const raw = await callClaude(buildEmailPrompt({ subject, sender: capture.sender ?? senderLabel, body, members, todayYmd, truncated }), Deno.env.get('ANTHROPIC_API_KEY')!)
    const extraction = parseEmailExtraction(raw)
    const plan = planWrites({ extraction, members, todayYmd, tz, capture: { id: capture.id, user_id: capture.user_id, subject, sender_label: senderLabel }, existing })

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
      // Dedupe against what the household already has from mail, not just
      // this capture. A school digest repeats itself day to day ("send the
      // take-home folder daily", "return the blue sheet") and a parent may
      // forward the same digest by hand (2026-09-03: both happened, three
      // copies of one sheet). Any mail-born row from the last two weeks
      // with the same words AND the same assignee already counts.
      const { data: existingInbox, error: existingInboxError } = await supabase
        .from('tasks').select('title, assigned_to, assigned_to_all').eq('user_id', capture.user_id)
        .not('capture_id', 'is', null).is('parent_task_id', null)
        .gte('created_at', new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000).toISOString())
        .limit(500)
      if (existingInboxError) throw new Error(`existing inbox read failed: ${existingInboxError.message}`)
      const existingRows = (existingInbox ?? []) as MailRowAudience[]
      const inboxToInsert = plan.inbox.filter(
        (t) => !existingRows.some((e) => itemsMatch(e.title, t.title) && sameAudience(e, t)),
      )
      if (inboxToInsert.length) {
        const { error } = await supabase.from('tasks').insert(inboxToInsert)
        if (error) throw new Error(`inbox insert failed: ${error.message}`)
      }
    }
    // Standing instructions become routines. Deduped by name against the
    // household's existing routines: a school digest repeats "send the folder
    // daily" in every issue, and a second copy would show the chore twice on
    // the wall for the rest of the year.
    if (plan.routines.length) {
      const { data: existingRoutines, error: routinesReadError } = await supabase
        .from('routines').select('name').in('user_id', userIds).limit(500)
      if (routinesReadError) throw new Error(`routines read failed: ${routinesReadError.message}`)
      const names = (existingRoutines ?? []).map((r) => r.name as string)
      const routinesToInsert = plan.routines.filter((r) => !names.some((n) => itemsMatch(n, r.name)))
      if (routinesToInsert.length) {
        const { error } = await supabase.from('routines').insert(routinesToInsert)
        if (error) throw new Error(`routines insert failed: ${error.message}`)
      }
    }

    if (plan.note) {
      // Retry-safe: skip the note if this capture already wrote one, keyed on
      // external_id (capture:<id>) rather than title, since sender+subject can
      // repeat across distinct emails (e.g. a weekly "Weekly Update").
      const { data: existingNote, error: existingNoteError } = await supabase
        .from('notes').select('id').eq('user_id', capture.user_id).eq('external_id', plan.note.external_id).limit(1)
      if (existingNoteError) throw new Error(`existing note read failed: ${existingNoteError.message}`)
      if (!existingNote || existingNote.length === 0) {
        const { error } = await supabase.from('notes').insert(plan.note)
        if (error) throw new Error(`note insert failed: ${error.message}`)
      }
    }

    if (plan.notices.length) {
      // Retry-safe: the model re-phrases between runs, so match by token
      // containment (itemsMatch), the same rule the inbox uses.
      // …and, like the inbox, against the household's recent notices: the
      // same standing info arrives in every digest for a fortnight.
      const { data: existingNotices, error: existingNoticesError } = await supabase
        .from('notices').select('text').eq('user_id', capture.user_id)
        .gte('received_on', new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10))
        .limit(500)
      if (existingNoticesError) throw new Error(`existing notices read failed: ${existingNoticesError.message}`)
      const seenTexts = (existingNotices ?? []).map((r) => r.text as string)
      const noticesToInsert = plan.notices.filter((n) => !seenTexts.some((e) => itemsMatch(e, n.text)))
      if (noticesToInsert.length) {
        const { error } = await supabase.from('notices').insert(noticesToInsert)
        if (error) throw new Error(`notices insert failed: ${error.message}`)
      }
    }

    await supabase.from('captures').update({ status: 'extracted', error: null }).eq('id', capture.id)
    return json({ ok: true, events: plan.events.length, children, inbox: plan.inbox.length, routines: plan.routines.length, note: !!plan.note, notices: plan.notices.length })
  } catch (e) {
    const { error: markError } = await supabase.from('captures').update({ status: 'failed', error: String(e) }).eq('id', capture.id)
    // If even this write fails the capture stays 'pending' and looks like a
    // lost dispatch; the log is the only place that says otherwise.
    if (markError) console.error('failed to mark capture failed', capture.id, markError.message)
    return json({ error: String(e) }, 500)
  }
})
