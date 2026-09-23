// PLAN-FROM-PAPER — "help me turn this into a plan". Two actions:
//
//   analyze  one or more photographed pages (+ the user's own explanation)
//            → a verbatim transcription and a PROPOSED plan: goals, tasks,
//            routine proposals and reference notes, with their placements,
//            relationships and flags (uncertain handwriting/dates, possible
//            duplicates).
//   revise   the current proposal + the conversation + a new message → an
//            updated proposal and a short reply. Text only: the pages are not
//            uploaded or read again.
//
// WRITES NOTHING. The client saves only what the user approves.
//
// Replaces parse-page for the Plan-from-paper flow. parse-page failed on a
// two-page spread (2026-09-23) because the model answered in prose ("I need
// to …") and the parser required bare JSON; here the reply is constrained by
// a JSON schema (structured outputs), so there is no prose to fail on.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  ANALYSIS_SCHEMA, REVISION_SCHEMA, buildAnalysisPrompt, buildRevisionPrompt, normalizeAnalysis,
  PlanError, classifyModelHttpError, isOwnPagePath, boundContext, LIMITS, applyRevision,
  type Analysis, type RevisionPatch,
} from './lib/plan.ts'

// Reading the photo: Opus. On a real two-page spread (2026-09-23) it kept the
// page's own misspellings and noted the likely word, where Sonnet silently
// corrected some and misread others as different real words — ~$0.55 vs
// ~$0.38 a spread (Sonnet at high effort ran out of room). Revising is text
// only: Sonnet.
// Env overrides switch either without a code change.
const READ = { model: Deno.env.get('PLAN_FROM_PAPER_READ_MODEL') || 'claude-opus-5', effort: Deno.env.get('PLAN_FROM_PAPER_READ_EFFORT') || 'high' }
const REVISE = { model: Deno.env.get('PLAN_FROM_PAPER_REVISE_MODEL') || 'claude-sonnet-5', effort: Deno.env.get('PLAN_FROM_PAPER_REVISE_EFFORT') || 'medium' }
type ModelChoice = typeof READ

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } })

type Block =
  | { type: 'image'; source: { type: 'url'; url: string } }
  | { type: 'text'; text: string }

/**
 * One streamed Messages call whose reply is constrained to `schema`. Streamed
 * so a long transcription is not cut off by an HTTP timeout; server-side
 * fallbacks re-run a refused request on another model inside the same call.
 */
async function callModel(content: Block[], schema: unknown, apiKey: string, { model, effort }: ModelChoice): Promise<{ text: string; usage: Record<string, number> }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 32000,
      stream: true,
      thinking: { type: 'adaptive' },
      output_config: { effort, format: { type: 'json_schema', schema } },
      fallbacks: 'default',
      messages: [{ role: 'user', content }],
    }),
  })
  if (!res.ok || !res.body) {
    console.error('model http error', res.status, (await res.text()).slice(0, 500))
    throw classifyModelHttpError(res.status)
  }

  let text = ''
  let stopReason: string | null = null
  const usage: Record<string, number> = {}
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      let ev: Record<string, unknown>
      try { ev = JSON.parse(line.slice(5)) } catch { continue }
      if (ev.type === 'content_block_delta') {
        const delta = ev.delta as { type?: string; text?: string }
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') text += delta.text
      } else if (ev.type === 'message_delta') {
        const d = ev.delta as { stop_reason?: string }
        if (d?.stop_reason) stopReason = d.stop_reason
        Object.assign(usage, ev.usage as Record<string, number> ?? {})
      } else if (ev.type === 'message_start') {
        Object.assign(usage, ((ev.message as { usage?: Record<string, number> })?.usage) ?? {})
      } else if (ev.type === 'error') {
        const err = ev.error as { type?: string; message?: string }
        console.error('model stream error', err?.type, err?.message)
        throw err?.type === 'overloaded_error' ? new PlanError('model_busy', 'The reading service is busy', 503) : new PlanError('unknown', err?.message ?? 'stream error', 502)
      }
    }
  }
  // Usage on every outcome, including a cut-off reply, so the cost of a
  // failed reading is visible too. Counts only — never page content.
  console.log('model usage', JSON.stringify({ model, effort, stopReason, chars: text.length, usage }))
  if (stopReason === 'refusal') throw new PlanError('model_refused', 'The reading service declined these pages', 422)
  if (stopReason === 'max_tokens') throw new PlanError('too_long', 'The pages hold more than one reading can return', 413)
  return { text, usage }
}

/**
 * The model call can outlast the gateway's 150 s idle timeout, which would
 * drop the reply after it was paid for. So once the request has passed every
 * check, the response starts at once and sends a space every 10 s until the
 * JSON is ready (JSON.parse ignores leading whitespace). The status is
 * already 200 by then, so a failure travels in the body as `{error}`.
 */
function streamed(work: () => Promise<unknown>): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(' '))
      const beat = setInterval(() => { try { controller.enqueue(enc.encode(' ')) } catch { /* closed */ } }, 10_000)
      try {
        controller.enqueue(enc.encode(JSON.stringify(await work())))
      } catch (e) {
        const err = e instanceof PlanError ? e : new PlanError('unknown', e instanceof Error ? e.message : String(e), 500)
        console.error('plan-from-paper failed', JSON.stringify({ code: err.code, message: err.message }))
        controller.enqueue(enc.encode(JSON.stringify({ error: { code: err.code, message: err.message } })))
      } finally {
        clearInterval(beat)
        controller.close()
      }
    },
  })
  return new Response(body, { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } })
}

function parseReply<T>(text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    // Structured outputs make this unreachable in practice; kept so a broken
    // reply is reported as such rather than as a raw parser message.
    throw new PlanError('reply_unreadable', 'The reply could not be understood', 502)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: { code: 'bad_request', message: 'POST only' } }, 405)

  const started = Date.now()
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) throw new PlanError('unauthorized', 'Missing Authorization', 401)
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!apiKey || !url || !serviceKey) throw new PlanError('server_config', 'Missing server config', 500)

    // A signed-in user only — checked before any work. The gateway's JWT check
    // also admits the public anon key, which is not a user.
    const service = createClient(url, serviceKey)
    const { data: { user }, error: authErr } = await service.auth.getUser(authHeader.slice('Bearer '.length))
    if (authErr || !user) throw new PlanError('unauthorized', 'Invalid token', 401)

    // Bodies are small (paths, text, a proposal); refuse anything outsized
    // before parsing it.
    const declared = Number(req.headers.get('content-length') ?? '0')
    if (declared > 400_000) throw new PlanError('bad_request', 'Request too large', 413)
    let body: {
      action?: 'analyze' | 'revise'
      storagePaths?: string[]
      instructions?: string | null
      context?: unknown
      analysis?: Analysis
      conversation?: { role: 'user' | 'assistant'; text: string }[]
      message?: string
    }
    try { body = await req.json() } catch { throw new PlanError('bad_request', 'Invalid JSON body', 400) }

    const ctx = boundContext(body.context)
    if (!ctx) throw new PlanError('bad_request', 'context with today (YYYY-MM-DD) required', 400)
    const instructions = typeof body.instructions === 'string' ? body.instructions.slice(0, LIMITS.instructions) : null

    if (body.action === 'analyze') {
      const paths = Array.isArray(body.storagePaths) ? body.storagePaths : []
      if (!paths.length || paths.length > LIMITS.images) throw new PlanError('bad_request', `Send 1 to ${LIMITS.images} images`, 400)
      // The service role signs these URLs, so this check is the boundary: only
      // the caller's own page images, no traversal, no other object types.
      if (!paths.every((p) => isOwnPagePath(p, user.id))) throw new PlanError('forbidden', 'Images must be your own uploaded pages', 403)

      const images: Block[] = []
      for (const [i, p] of paths.entries()) {
        const { data: signed, error } = await service.storage.from('attachments').createSignedUrl(p, 900)
        if (error || !signed?.signedUrl) throw new PlanError('image_unavailable', `Image ${i + 1} could not be opened`, 404)
        images.push({ type: 'text', text: `Image ${i + 1}:` }, { type: 'image', source: { type: 'url', url: signed.signedUrl } })
      }
      return streamed(async () => {
        const { text, usage } = await callModel(
          [...images, { type: 'text', text: buildAnalysisPrompt(ctx, paths.length, instructions) }],
          ANALYSIS_SCHEMA, apiKey, READ,
        )
        const analysis = normalizeAnalysis(parseReply(text))
        console.log('analyze ok', JSON.stringify({ ms: Date.now() - started, images: paths.length, items: analysis.items.length, usage }))
        return { ok: true, analysis }
      })
    }

    if (body.action === 'revise') {
      const message = typeof body.message === 'string' ? body.message.trim().slice(0, LIMITS.message) : ''
      if (!message) throw new PlanError('bad_request', 'message required', 400)
      // Re-normalised: the proposal comes back from the client and is only
      // ever prompt text, never trusted as-is.
      const current = normalizeAnalysis(body.analysis)
      const currentJson = JSON.stringify(current)
      if (currentJson.length > LIMITS.analysisJsonChars) throw new PlanError('bad_request', 'Proposal too large to revise', 413)
      const history = (Array.isArray(body.conversation) ? body.conversation : []).slice(-LIMITS.conversationTurns)
        .map((m) => `${m?.role === 'user' ? 'User' : 'You'}: ${String(m?.text ?? '').slice(0, LIMITS.conversationChars)}`).join('\n\n')
      return streamed(async () => {
        const { text, usage } = await callModel([{
          type: 'text',
          text: `${buildRevisionPrompt(ctx, instructions)}

Current proposal (JSON):
${currentJson}

${history ? `Conversation so far:\n${history}\n\n` : ''}User: ${message}`,
        }], REVISION_SCHEMA, apiKey, REVISE)
        const reply = parseReply<{ reply?: string; changes?: string[] } & RevisionPatch>(text)
        const analysis = applyRevision(current, reply)
        console.log('revise ok', JSON.stringify({ ms: Date.now() - started, items: analysis.items.length, usage }))
        return {
          ok: true,
          reply: typeof reply.reply === 'string' ? reply.reply : '',
          changes: Array.isArray(reply.changes) ? reply.changes.filter((c) => typeof c === 'string') : [],
          analysis,
        }
      })
    }

    throw new PlanError('bad_request', 'action must be analyze or revise', 400)
  } catch (e) {
    const err = e instanceof PlanError ? e : new PlanError('unknown', e instanceof Error ? e.message : String(e), 500)
    console.error('plan-from-paper failed', JSON.stringify({ code: err.code, message: err.message, ms: Date.now() - started }))
    return json({ error: { code: err.code, message: err.message } }, err.status)
  }
})
