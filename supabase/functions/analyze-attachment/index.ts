// ANALYZE-ATTACHMENT — given an attachments row (image or PDF), runs Claude
// vision and writes a validated, closed-vocabulary facet list onto the row
// (spec: docs/superpowers/specs/2026-07-14-attachment-facets-design.md).
// Idempotent: analyzed_at set → no-op. Failures write facets [] + analyzed_at
// after one retry so the panel quietly shows nothing. Auth: user JWT; row
// reads/writes go through the caller-scoped client so RLS enforces ownership.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { tryParseFacets, type Facet } from '../_shared/facets.ts'
import { parseDocumentProposal, stripSensitive, type DocumentProposal } from '../_shared/documents.ts'

const MODEL = 'claude-sonnet-4-6'
const MAX_CONTEXT = 300

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

function buildPrompt(entityContext: string): string {
  return `You extract actionable facts from a file the user attached to an item in Symphony, their personal task/calendar app.
Attached to: ${entityContext || '(no context)'}

Respond with ONLY a JSON object (no markdown fences, no prose): {"facets":[...]}. Each facet is one of:
{"type":"summary","text":"one sentence: what this file is"}
{"type":"location","label":"Party address","address":"full address, complete enough to navigate to"}
{"type":"access_code","label":"Door code","code":"exactly as printed"}
{"type":"phone","label":"Host","number":"+1 ..."}
{"type":"datetime","label":"Check-in","iso":"2026-07-18T16:00:00"}
{"type":"link","label":"Registry","url":"https://..."}
{"type":"checklist","label":"To do","items":["RSVP by Friday","Bring a bathing suit"]}
{"type":"purchase_item","name":"item to buy","specs":"size, model, wattage — everything visible or inferable"}

Rules:
- Exactly one summary, first.
- Only facets plainly supported by the file — never invent or pad.
- Prefer fewer, higher-value facets; skip trivia.
- datetime iso is the file's local time; no timezone guessing.
- A photo of a broken/burned-out part or product → purchase_item with buy-ready specs.
- A document/screenshot → transcribe the load-bearing facts into typed facets, not prose.

Also decide whether this file is a DURABLE DOCUMENT — something the user will need again later, independent of whatever it is attached to (an ID, a passport, an insurance card, a registration, a title, a policy, a warranty, a contract, a tax or bank statement, a medical record).

If it is, add a sibling key to the JSON object:
"document": {"kind":"<one of: drivers_license, passport, birth_certificate, social_security_card, insurance_card, vehicle_registration, vehicle_title, medical_record, tax_document, bank_document, warranty, receipt, contract, other>","label":"short human name, e.g. Scott's driver's license","owner":"whose document it is, if visible","expires_on":"YYYY-MM-DD if an expiry is printed"}

Omit the "document" key entirely for ordinary files (a party invite, a photo of a broken part, a screenshot). A receipt is only a document when it is proof of a purchase worth keeping — not a grocery receipt.

The label must identify this file on its own, because the user will see it in a list next to other documents of the same kind. When the file is clearly ONE PART of a multi-part document, the label MUST end with the part in parentheses — "(front)", "(back)", "(page 2)". Judge the side from what is visible: the side with the photo, name and date of birth is the front; the side with barcodes, magnetic stripe, endorsements or donor/organ text is the back. If you genuinely cannot tell which part it is, still say so — end the label with "(one side)" rather than leaving it ambiguous. Never return the same label for two different sides.`
}

async function callVision(fileUrl: string, isPdf: boolean, prompt: string, apiKey: string): Promise<string> {
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'url', url: fileUrl } }
    : { type: 'image', source: { type: 'url', url: fileUrl } }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('No text in Anthropic response')
  return text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing Authorization' }, 401)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!apiKey || !url || !anon || !serviceKey) return json({ error: 'Missing server config' }, 500)

  const service = createClient(url, serviceKey)
  const { data: { user }, error: authErr } = await service.auth.getUser(authHeader.slice('Bearer '.length))
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  // User-scoped client: every table op below is RLS-enforced as the caller.
  const db = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })

  let body: { attachmentId?: string; entityContext?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const { attachmentId } = body
  if (!attachmentId) return json({ error: 'attachmentId required' }, 400)
  const entityContext = (body.entityContext ?? '').slice(0, MAX_CONTEXT)

  const { data: row, error: rowErr } = await db
    .from('attachments')
    .select('id, storage_path, file_type, analyzed_at')
    .eq('id', attachmentId)
    .maybeSingle()
  if (rowErr) return json({ error: `Attachment lookup failed: ${rowErr.message}` }, 500)
  if (!row) return json({ error: 'Attachment not found' }, 404)
  if (row.analyzed_at) return json({ status: 'already' })

  const isImage = row.file_type?.startsWith('image/')
  const isPdf = row.file_type === 'application/pdf'
  const finish = async (facets: unknown[], proposal: DocumentProposal | null = null) => {
    const patch: Record<string, unknown> = { facets, analyzed_at: new Date().toISOString() }
    if (proposal) {
      // document_scope is deliberately left to its column default ('private'),
      // so a proposal can never arrive pre-shared.
      patch.document_status = 'proposed'
      patch.document_kind = proposal.kind
      patch.document_label = proposal.label
      patch.document_owner = proposal.owner
      patch.document_expires_on = proposal.expiresOn
    }
    const { error } = await db.from('attachments')
      .update(patch)
      .eq('id', attachmentId)
    if (error) console.error('facets write failed:', error.message)
  }
  if (!isImage && !isPdf) { await finish([]); return json({ status: 'skipped' }) }

  const { data: signed, error: signErr } = await service.storage
    .from('attachments')
    .createSignedUrl(row.storage_path, 600)
  if (signErr || !signed?.signedUrl) return json({ error: `Could not sign URL: ${signErr?.message}` }, 500)

  const prompt = buildPrompt(entityContext)

  /** One vision call → validated facets plus an optional document proposal.
   *  Redaction happens here, before anything is returned to the caller: a
   *  sensitive document's own numbers never reach the row, and therefore never
   *  reach the context graph (see _shared/context-graph/build.ts). */
  const analyzeOnce = async (): Promise<{ facets: Facet[]; proposal: DocumentProposal | null }> => {
    const raw = await callVision(signed.signedUrl, isPdf, prompt, apiKey)
    const parsed = tryParseFacets(raw)
    if (parsed === null) throw new Error('Invalid facets structure from model')

    // The document block rides alongside `facets` in the same object. A failure
    // to read it must not cost us the facets we already parsed.
    let proposal: DocumentProposal | null = null
    try {
      const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
      const obj = JSON.parse(stripped) as Record<string, unknown>
      proposal = parseDocumentProposal(obj.document)
    } catch {
      proposal = null
    }

    return { facets: proposal ? stripSensitive(parsed, proposal.kind) : parsed, proposal }
  }

  let facets: Facet[] = []
  let proposal: DocumentProposal | null = null
  try {
    ;({ facets, proposal } = await analyzeOnce())
  } catch (err) {
    console.error('first analysis attempt failed, retrying once:', err instanceof Error ? err.message : err)
    try {
      ;({ facets, proposal } = await analyzeOnce())
    } catch (err2) {
      console.error('analysis failed after retry:', err2 instanceof Error ? err2.message : err2)
    }
  }
  await finish(facets, proposal)
  return json({ status: 'done', facetCount: facets.length, document: proposal?.kind ?? null })
})
