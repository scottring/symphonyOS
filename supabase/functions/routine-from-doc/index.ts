// supabase/functions/routine-from-doc/index.ts
//
// The AI routine builder's parser: a PT exercise sheet, a coach's plan, a
// pasted email — in; ONE structured routine proposal — out. The model
// proposes; the client's preview disposes (the user edits and confirms
// before anything is created). Mirrors rhythms-parse's shape: strict JSON,
// server-side validation, conservative extraction.
//
// Input (JSON): { text?: string, file?: { mediaType: string, base64: string } }
//   - text: pasted instructions / description
//   - file: a PDF or image (≤ ~5MB base64) — PT sheets, screenshots, scans
// Output: { proposal: RoutineProposal | null, note: string }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'claude-sonnet-4-6' // documents/images need the multimodal tier

const SYSTEM_PROMPT = `You turn a document or description into ONE recurring routine for a personal planning app. Typical inputs: physical-therapy exercise sheets, workout plans, medication instructions, chore checklists, coach emails.

Extract:
- name: short routine name (e.g. "Shoulder PT exercises") — from the document's own framing when possible
- recurrence: {"type":"daily"} or {"type":"weekly","days":["monday",...]} — what the document prescribes; default daily if it clearly recurs but frequency is unstated
- timeOfDay: "HH:MM" 24h ONLY if the document names a time, else null
- timesPerDay: integer ONLY if it prescribes N sessions per day (e.g. "twice daily"), else null
- steps: the individual exercises/actions IN ORDER. Each: {"name": short imperative (≤8 words), "detail": reps/sets/holds/duration/side + key form cues, ≤140 chars, verbatim numbers from the document}
- note: one sentence (≤20 words) on anything ambiguous or that the user should verify

Be conservative: never invent reps, frequencies, or exercises not in the source. If the input describes no recurring activity, return {"proposal": null, "note": "why"}.

Output ONLY JSON:
{"proposal":{"name":"...","recurrence":{"type":"daily"},"timeOfDay":null,"timesPerDay":null,"steps":[{"name":"...","detail":"..."}]},"note":"..."}`

interface StepProposal { name: string; detail?: string }
interface RoutineProposal {
  name: string
  recurrence: { type: 'daily' } | { type: 'weekly'; days: string[] }
  timeOfDay: string | null
  timesPerDay: number | null
  steps: StepProposal[]
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function extractJson(s: string): string {
  const start = s.indexOf('{')
  if (start < 0) return s
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1)
  }
  return s
}

const DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])

/** Server-side validation: nothing reaches the client unvalidated. */
function validateProposal(raw: unknown): RoutineProposal | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  if (typeof p.name !== 'string' || !p.name.trim()) return null
  const rec = p.recurrence as Record<string, unknown> | undefined
  let recurrence: RoutineProposal['recurrence']
  if (rec?.type === 'weekly' && Array.isArray(rec.days)) {
    const days = rec.days.filter((d): d is string => typeof d === 'string' && DAYS.has(d.toLowerCase())).map((d) => d.toLowerCase())
    recurrence = days.length > 0 ? { type: 'weekly', days } : { type: 'daily' }
  } else {
    recurrence = { type: 'daily' }
  }
  const timeOfDay = typeof p.timeOfDay === 'string' && /^\d{2}:\d{2}$/.test(p.timeOfDay) ? p.timeOfDay : null
  const timesPerDay = typeof p.timesPerDay === 'number' && Number.isInteger(p.timesPerDay) && p.timesPerDay >= 2 && p.timesPerDay <= 12
    ? p.timesPerDay : null
  const steps = (Array.isArray(p.steps) ? p.steps : [])
    .map((s): StepProposal | null => {
      if (typeof s !== 'object' || s === null) return null
      const st = s as Record<string, unknown>
      if (typeof st.name !== 'string' || !st.name.trim()) return null
      return {
        name: st.name.trim().slice(0, 80),
        detail: typeof st.detail === 'string' && st.detail.trim() ? st.detail.trim().slice(0, 160) : undefined,
      }
    })
    .filter((s): s is StepProposal => s !== null)
    .slice(0, 25)
  return { name: p.name.trim().slice(0, 80), recurrence, timeOfDay, timesPerDay, steps }
}

const ALLOWED_MEDIA = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_BASE64 = 7_500_000 // ~5.5MB binary

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError(401, 'missing authorization')
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) return jsonError(500, 'ANTHROPIC_API_KEY not set')

    const body = await req.json().catch(() => ({}))
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const file = body.file && typeof body.file.base64 === 'string' && typeof body.file.mediaType === 'string' ? body.file : null
    if (!text && !file) return jsonError(400, 'text or file is required')
    if (file && !ALLOWED_MEDIA.has(file.mediaType)) return jsonError(400, `unsupported file type: ${file.mediaType}`)
    if (file && file.base64.length > MAX_BASE64) return jsonError(413, 'file too large (max ~5MB)')

    const content: unknown[] = []
    if (file) {
      content.push(file.mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: file.mediaType, data: file.base64 } }
        : { type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.base64 } })
    }
    content.push({ type: 'text', text: text || 'Extract the routine from the attached document.' })

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      }),
    })
    if (!resp.ok) return jsonError(502, `anthropic ${resp.status}: ${await resp.text()}`)
    const data = await resp.json()
    const textOut: string = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')

    let parsed: { proposal?: unknown; note?: string }
    try {
      parsed = JSON.parse(extractJson(textOut))
    } catch (e) {
      return jsonError(502, `model returned non-JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
    const proposal = parsed.proposal ? validateProposal(parsed.proposal) : null
    return new Response(JSON.stringify({ proposal, note: typeof parsed.note === 'string' ? parsed.note : '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(500, `unexpected: ${e instanceof Error ? e.message : String(e)}`)
  }
})
