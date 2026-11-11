import { pdfSourcePages, requestBudget, searchFeeTokens, serviceBudgetControl, statedBudget, type BudgetControl, type PdfSource } from './aiBudget.ts'
/** Provider-call admission with a conservative monetary hold. No local fallback: a
 * missing migration/configuration or failed reservation means no paid call. */
/** Every interactive paid route (the caller is a signed-in person). Must match
 *  the allowlist in reserve_ai_provider_call (migration 20261015110000). */
export const GUARDED_AI_ROUTES = [
  'symphony-agent', 'workspace-voice', 'wall-ask', 'wall-say',
  'analyze-attachment', 'analyze-capture', 'analyze-link', 'extract-capture', 'parse-page', 'plan-from-paper', 'routine-from-doc',
  'goal-planning-chat', 'planning-conversation', 'tend-week', 'sharpen-goal', 'suggest-waiting-for', 'rhythms-parse',
  'kiosk-agent', 'math-story', 'meal-planner-chat', 'meal-slot-suggest', 'semantic-search', 'note-match',
  'question-ideas',
] as const
export type GuardedAiRoute = typeof GUARDED_AI_ROUTES[number]
type UsageDb = Parameters<typeof serviceBudgetControl>[0] & { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

/** What a paid request cost, read from the provider's JSON reply (tokens) or
 *  supplied by the caller for audio (minutes). Recorded in the spend ledger
 *  (migration 20261015150000); never the words. */
export interface AiUsageRecord { model: string; inputTokens: number; outputTokens: number; minutes: number }
/** For requests whose reply carries no usage (a realtime handshake, speech):
 *  the caller's estimate, charged up front. */
export interface AiUsageEstimate { model: string; minutes?: number; inputTokens?: number; outputTokens?: number }

/** The model named in a JSON request body, if any. */
export function modelOf(init?: RequestInit): string | null {
  try {
    if (typeof init?.body !== 'string') return null
    const body = JSON.parse(init.body) as { model?: unknown }
    return typeof body.model === 'string' ? body.model : null
  } catch { return null }
}

/** Usage from an Anthropic or OpenAI JSON reply; null when it carries none. */
export function usageOf(body: unknown, fallbackModel: string | null): AiUsageRecord | null {
  if (!body || typeof body !== 'object') return null
  const b = body as { model?: unknown; usage?: Record<string, unknown> }
  const u = b.usage
  if (!u || typeof u !== 'object') return null
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0)
  const model = typeof b.model === 'string' ? b.model : fallbackModel
  if (!model) return null
  // The ledger prices input-equivalent tokens, so cached tokens are folded in
  // at what Anthropic charges for them: a cache read at 0.1x the input rate
  // (0.1x on Sonnet and Haiku, less on Opus 5.5 and Fable, so never under), a
  // five-minute cache write at 1.25x, a one-hour write at 2x, and a write the
  // reply doesn't break down at 2x. Until 2026-10-31 reads were charged at the
  // full rate, which put a cached chat at about ten times its real cost and
  // ran the household's daily allowance out by mid-afternoon.
  // Each web search's 1¢ fee rides along as the input tokens that cost 1¢.
  const tools = u.server_tool_use && typeof u.server_tool_use === 'object' ? u.server_tool_use as Record<string, unknown> : {}
  const input = n(u.input_tokens ?? u.prompt_tokens) + cachedInputTokens(u)
    + n(tools.web_search_requests) * searchFeeTokens(model)
  const output = n(u.output_tokens ?? u.completion_tokens)
  if (!input && !output) return null
  return { model, inputTokens: input, outputTokens: output, minutes: 0 }
}

/** Cache reads and writes as input-equivalent tokens, rounded up. Worked in
 *  twentieths so the multipliers stay exact (0.1 = 2/20, 1.25 = 25/20). */
function cachedInputTokens(u: Record<string, unknown>): number {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0)
  const read = n(u.cache_read_input_tokens)
  const written = n(u.cache_creation_input_tokens)
  const split = u.cache_creation && typeof u.cache_creation === 'object' ? u.cache_creation as Record<string, unknown> : {}
  const fiveMinute = Math.min(n(split.ephemeral_5m_input_tokens), written)
  const oneHour = Math.min(n(split.ephemeral_1h_input_tokens), written - fiveMinute)
  const unsplit = written - fiveMinute - oneHour
  return Math.ceil((2*read + 25*fiveMinute + 40*(oneHour + unsplit)) / 20)
}

export class AiUsageError extends Error {
  readonly status: number
  readonly code: string
  constructor(reason: string, readonly retryAt?: string) {
    const limited = reason === 'daily_limit' || reason === 'monthly_limit'
    const when = reason === 'monthly_limit' ? 'month' : 'day'
    // Every refusal that is not a spent allowance keeps the one client code
    // (ai_usage_unavailable); the words say which it is. Until 2026-11-11 a
    // PDF attachment and an account with no household both read "usage
    // controls are not ready", which pointed at the wrong thing.
    super(limited
      ? `The AI allowance for this ${when} has been reached. It resets ${retryAt ? `at ${retryAt}` : `next ${when}`} (UTC). You can still view and change your plans directly.`
      : reason === 'no_household'
        ? 'AI needs your account to belong to a household, because the household shares its allowance. You can still view and change your plans directly.'
        : reason === 'unpriceable'
          ? 'AI can’t take this request yet: Symphony can’t tell what it would cost (an attachment it can’t open or measure, for example). You can still view and change your plans directly.'
          : 'AI is unavailable while its usage controls are not ready. You can still view and change your plans directly.')
    this.name = 'AiUsageError'
    this.status = limited ? 429 : 503
    this.code = limited ? `ai_${reason}` : 'ai_usage_unavailable'
  }
}

/** One reservation per outbound provider attempt, including retries/tool-loop
 * follow-ups and embeddings. Supply this only for paid provider requests.
 * `estimate` is for audio whose reply carries no usage (speech, a realtime
 * call): it is accepted only for the models and caps aiBudget.ts lists
 * (STATED_AUDIO), and charged as stated. */
export function guardedAiFetch(db: UsageDb, route: GuardedAiRoute, transport: typeof fetch = fetch, estimate?: AiUsageEstimate, control?: BudgetControl): typeof fetch {
  return budgetFetch(()=>control?Promise.resolve(control):serviceBudgetControl(db),route,transport,estimate)
}

/** PostgREST's answer for a function signature the database does not have:
 *  the minutes / cache-multiplier arguments before migration 20261111120000. */
function missingSignature(error: unknown): boolean {
  const e = error as { code?: unknown; status?: unknown } | null
  return !!e && typeof e === 'object' && (e.code === 'PGRST202' || e.status === 404)
}

/** Settle only confirmed usage. A failed settlement keeps the conservative
 * monetary hold in place; the response remains readable by the caller. */
function budgetFetch(authority:()=>Promise<BudgetControl>,route:string,transport:typeof fetch,estimate?:AiUsageEstimate):typeof fetch {
  let control:Promise<BudgetControl>|undefined
  // Until migration 20261111120000 is applied the reservation takes no minutes
  // or cache multiplier: token requests then reserve at the old 2x input
  // (safe, only larger), and per-minute audio is refused.
  let legacy=false
  // A PDF at a URL is measured once per request, not once per tool-loop pass.
  const pages=new Map<string,Promise<number|null|'unreadable'>>()
  const pagesOf=(source:PdfSource)=>{
    if('data' in source) return pdfSourcePages(source)
    if(!pages.has(source.url)) pages.set(source.url,pdfSourcePages(source))
    return pages.get(source.url)!
  }
  return async(input,init)=>{
    const budget=estimate?statedBudget(estimate,init):await requestBudget(init,pagesOf)
    if(!budget) throw new AiUsageError('unpriceable')
    let owner:BudgetControl, reservation:{allowed?:boolean;reservation_id?:string;reason?:string;retry_at?:string}
    try {
      owner=await(control??=authority())
      const args={p_user:owner.userId,p_route:route,p_model:budget.model,p_input:budget.input,p_output:budget.output}
      let result=legacy?null:await owner.db.rpc('reserve_ai_budget',{...args,p_minutes:budget.minutes,p_input_multiplier:budget.inputMultiplier})
      if(result && missingSignature(result.error)) { legacy=true; result=null }
      if(!result) {
        if(budget.minutes>0) throw new Error('Per-minute funding needs migration 20261111120000')
        result=await owner.db.rpc('reserve_ai_budget',args)
      }
      if(result.error) throw new Error('Reservation failed')
      reservation=(result.data??{}) as typeof reservation
    } catch {throw new AiUsageError('unavailable')}
    if(reservation.allowed!==true||!reservation.reservation_id) throw new AiUsageError(reservation.reason??'unavailable',reservation.retry_at)
    const id=reservation.reservation_id
    const settle=(usage:{inputTokens:number;outputTokens:number;minutes:number}|null)=>owner.db.rpc('settle_ai_budget',{
      p_id:id,p_user:owner.userId,p_input:usage?.inputTokens??0,p_output:usage?.outputTokens??0,
      ...(legacy?{}:{p_minutes:usage?.minutes??0}),
    })
    const response=await transport(input,init) // A timeout leaves its hold intact.
    const refused=[400,401,403,404,422,429].includes(response.status)
    try {
      if(budget.stated) {
        // Speech and realtime replies carry no usage: an accepted call is
        // charged what was stated (and held); a refused one nothing.
        if(response.ok) await settle({inputTokens:budget.input,outputTokens:0,minutes:budget.minutes})
        else if(refused) await settle(null)
        return response
      }
      if(budget.stream && response.ok && response.body && /event-stream/i.test(response.headers.get('content-type')??'')) {
        return settledStream(response,budget.model,settle)
      }
      const usage=/json/i.test(response.headers.get('content-type')??'')?usageOf(await response.clone().json().catch(()=>null),budget.model):null
      if(usage || refused) await settle(usage)
    } catch { /* The hold stays charged when settlement cannot be confirmed. */ }
    return response
  }
}

/** The streamed reply, passed through unchanged, with its usage read from
 *  the events on the way: Anthropic's message_start (input, cache) and
 *  message_delta (output, cumulative), or OpenAI's final usage chunk. It is
 *  settled only when the stream finished (message_stop or [DONE]); a stream
 *  cut short, cancelled or errored keeps its hold. */
function settledStream(response:Response,model:string,settle:(usage:AiUsageRecord|null)=>PromiseLike<unknown>):Response {
  const decoder=new TextDecoder()
  const usage:Record<string,unknown>={}
  let finished=false, buffer=''
  const read=(line:string)=>{
    line=line.trim()
    if(!line.startsWith('data:')) return
    const data=line.slice(5).trim()
    if(data==='[DONE]') { finished=true; return }
    let event:{type?:unknown;usage?:unknown;message?:{usage?:unknown}}
    try { event=JSON.parse(data) } catch { return }
    if(!event || typeof event!=='object') return
    const message=event.message && typeof event.message==='object' ? event.message : null
    if(message?.usage && typeof message.usage==='object') Object.assign(usage,message.usage)
    if(event.usage && typeof event.usage==='object') Object.assign(usage,event.usage)
    if(event.type==='message_stop') finished=true
  }
  const scan=(text:string)=>{
    buffer+=text
    let nl
    while((nl=buffer.indexOf('\n'))>=0) { read(buffer.slice(0,nl)); buffer=buffer.slice(nl+1) }
  }
  const body=response.body!.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
    transform(chunk,controller) { controller.enqueue(chunk); scan(decoder.decode(chunk,{stream:true})) },
    async flush() {
      scan(decoder.decode()); read(buffer)
      if(!finished) return
      // Priced at the reserved model (settle_ai_budget uses the reservation's).
      try { await settle(usageOf({model,usage},model)) } catch { /* the hold stays */ }
    },
  }))
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers})
}

/** Background paid routes: a worker or cron charging the person it works
 *  for. Must match ai_background_routes() (migration 20261015120000). */
export const BACKGROUND_AI_ROUTES = ['email-scanner', 'extract-email', 'gmail-check', 'school-digest', 'proactive-engine', 'vault-sync', 'extract-capture', 'parse-page'] as const
export type BackgroundAiRoute = typeof BACKGROUND_AI_ROUTES[number]
type ServiceDb = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }
// reserveAiProviderCall / reserveAiProviderCallFor (call counts, no money)
// were removed 2026-11-11: migration 20261016094000 revoked their database
// functions from every role, so they could only ever refuse.

/** One reservation per outbound provider attempt, charged to `userId`. */
export function guardedAiFetchFor(db: ServiceDb, userId: string, route: BackgroundAiRoute, transport: typeof fetch = fetch, estimate?: AiUsageEstimate): typeof fetch {
  return budgetFetch(()=>Promise.resolve({userId,db}),route,transport,estimate)
}
