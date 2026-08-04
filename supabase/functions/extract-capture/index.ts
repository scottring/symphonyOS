// EXTRACT-CAPTURE — given a captures row id, loads the raw text, dedupes
// against the source checkpoint, runs Anthropic extraction, writes candidate
// tasks (bucket=inbox, context=family) + a triage note, and advances the
// checkpoint. Auth: shared secret (x-capture-secret), same as capture-to-inbox.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseWhatsAppExport } from './lib/whatsapp.ts'
import { filterSince } from './lib/dedupe.ts'
import { buildExtractPrompt, parseExtractResponse, type CandidateItem, type GapFlag } from './lib/extract.ts'
import { chunkMessages } from './lib/chunk.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-capture-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic returned ${res.status}`)
  const data = await res.json()
  const text = (data as { content?: { text?: string }[] })?.content?.[0]?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

function candidateToTaskRow(
  c: CandidateItem,
  userId: string,
  capture: { id: string; source_key: string | null; source_label: string | null },
) {
  // Build a human-readable notes string from the structured candidate fields.
  // Column name is `notes` (text, nullable) — confirmed in 002_tasks.sql.
  const notesLines = [
    c.location ? `Location: ${c.location}` : '',
    c.rsvp?.needed
      ? `RSVP: ${[c.rsvp.to && `to ${c.rsvp.to}`, c.rsvp.by && `by ${c.rsvp.by}`, c.rsvp.method].filter(Boolean).join(', ')}`
      : '',
    c.giftsExpected ? `Gifts: ${c.giftsExpected}` : '',
    c.cost ? `Cost: ${c.cost}` : '',
    c.forWho ? `For: ${c.forWho}` : '',
    `Source: ${capture.source_label ?? capture.source_key ?? 'capture'} (confidence ${c.confidence.toFixed(2)})`,
    `Proposed time: ${c.startTime ?? 'unknown'}`,
  ].filter(Boolean)

  // Schema-confirmed columns (002_tasks.sql + subsequent migrations):
  //   title      — text not null                              (002)
  //   completed  — boolean not null default false             (002)
  //   notes      — text nullable                              (002)
  //   bucket     — text (inbox|week|month|quarter|timed)      (present in app + capture-to-inbox)
  //   context    — text check ('work','family','personal')    (010_add_context_and_assigned_to)
  //   category   — text check ('task','chore','errand','event','activity') default 'task' (028_task_category)
  //   scope      — text check ('individual','couple','compound') NOT NULL
  //                default 'individual'                       (2026-06-07_scope_axis)
  //
  // scope MUST be set explicitly. RLS shares on scope, not context, so a
  // family-context row left at the 'individual' default is visible to its owner
  // on the family view but unreadable by the rest of the household — the row
  // looks shared and isn't. Mirrors defaultScopeForArea() in src/lib/scope.ts.
  return {
    user_id: userId,
    title: c.title,
    bucket: 'inbox',
    context: 'family',
    scope: 'compound',
    category: c.category,
    completed: false,
    notes: notesLines.join('\n'),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const secret = Deno.env.get('CAPTURE_SHARED_SECRET') ?? ''
  if (!secret || req.headers.get('x-capture-secret') !== secret) return json({ error: 'unauthorized' }, 401)

  const { capture_id } = (await req.json()) as { capture_id?: string }
  if (!capture_id) return json({ error: 'capture_id required' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: capture, error: capErr } = await supabase.from('captures').select('*').eq('id', capture_id).single()
  if (capErr || !capture) return json({ error: 'capture not found' }, 404)

  try {
    const MAX_CHARS = 300_000
    let newestIso: string | null = null
    let chunks: string[]

    if (capture.kind === 'whatsapp_export' && capture.source_key) {
      const { data: cp } = await supabase
        .from('capture_checkpoints')
        .select('last_processed_at')
        .eq('user_id', capture.user_id)
        .eq('source_key', capture.source_key)
        .maybeSingle()
      const lastIso = cp?.last_processed_at ? cp.last_processed_at.replace(' ', 'T').slice(0, 19) : null
      const { fresh, newestIso: n } = filterSince(parseWhatsAppExport(capture.raw_text ?? ''), lastIso)
      newestIso = n
      chunks = chunkMessages(fresh, MAX_CHARS)
    } else {
      chunks = capture.raw_text && capture.raw_text.trim() ? [capture.raw_text] : []
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!
    const label = capture.source_label ?? capture.source_key ?? 'capture'
    const merged: { candidates: CandidateItem[]; summary: string[]; gaps: GapFlag[] } = { candidates: [], summary: [], gaps: [] }
    for (const chunk of chunks) {
      const r = parseExtractResponse(await callAnthropic(buildExtractPrompt(chunk, label), apiKey))
      merged.candidates.push(...r.candidates)
      if (r.summary) merged.summary.push(r.summary)
      merged.gaps.push(...r.gaps)
    }
    const result = {
      candidates: merged.candidates,
      summary: chunks.length === 0 ? `Nothing new since ${newestIso ?? 'last run'}.` : (merged.summary.join(' ') || 'No actionable items found.'),
      gaps: merged.gaps,
    }

    if (result.candidates.length > 0) {
      const rows = result.candidates.map((c) => candidateToTaskRow(c, capture.user_id, capture))
      const { error } = await supabase.from('tasks').insert(rows)
      if (error) throw new Error(`task insert failed: ${error.message}`)
    }

    const gapText = result.gaps.length
      ? '\n\nNeeds another look:\n' + result.gaps.map((g) => `- ${g.note}`).join('\n')
      : ''

    // notes table schema (022_notes.sql + 063_context_based_sharing.sql + 069_vault_sync.sql):
    //   title   — text nullable
    //   content — text not null
    //   context — text check ('work','family','personal')   added in 063
    //   source  — text check ('manual','fathom','voice','import','task','vault')
    //             NOTE: plan used 'inbox_triage' which violates this constraint;
    //             corrected to 'import' (closest valid value for programmatic ingestion).
    //   type    — text check (...,'general',...) — using 'general' (appropriate default)
    //   scope   — same scope axis as tasks (2026-06-07_scope_axis); notes RLS
    //             shares on scope too, so 'family' context alone shares nothing.
    const { error: noteErr } = await supabase.from('notes').insert({
      user_id: capture.user_id,
      title: `Capture: ${capture.source_label ?? capture.source_key ?? 'note'}`,
      content: `${result.summary}${gapText}`,
      context: 'family',
      scope: 'compound',
      source: 'import',
      type: 'general',
    })
    if (noteErr) throw new Error(`note insert failed: ${noteErr.message}`)

    if (capture.kind === 'whatsapp_export' && capture.source_key && newestIso) {
      await supabase.from('capture_checkpoints').upsert({
        user_id: capture.user_id,
        source_key: capture.source_key,
        last_processed_at: newestIso,
        updated_at: new Date().toISOString(),
      })
    }
    await supabase.from('captures').update({ status: 'extracted' }).eq('id', capture.id)
    return json({ ok: true, candidates: result.candidates.length, gaps: result.gaps.length })
  } catch (e) {
    await supabase.from('captures').update({ status: 'failed', error: String(e) }).eq('id', capture.id)
    return json({ error: String(e) }, 500)
  }
})
