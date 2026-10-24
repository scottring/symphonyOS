import { serviceBudgetControl, textBudget, type BudgetControl } from './aiBudget.ts'
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
  // Charge cached reads at the full input rate and cache creation at 2x.
  // This intentionally overestimates cache discounts; it never omits them.
  const input = n(u.input_tokens ?? u.prompt_tokens) + 2*n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens)
  const output = n(u.output_tokens ?? u.completion_tokens)
  if (!input && !output) return null
  return { model, inputTokens: input, outputTokens: output, minutes: 0 }
}

export class AiUsageError extends Error {
  readonly status: number
  readonly code: string
  constructor(reason: string, readonly retryAt?: string) {
    const limited = reason === 'daily_limit' || reason === 'monthly_limit'
    const when = reason === 'monthly_limit' ? 'month' : 'day'
    super(limited
      ? `The AI allowance for this ${when} has been reached. It resets ${retryAt ? `at ${retryAt}` : `next ${when}`} (UTC). You can still view and change your plans directly.`
      : 'AI is unavailable while its usage controls are not ready. You can still view and change your plans directly.')
    this.name = 'AiUsageError'
    this.status = limited ? 429 : 503
    this.code = limited ? `ai_${reason}` : 'ai_usage_unavailable'
  }
}

export async function reserveAiProviderCall(db: UsageDb, route: GuardedAiRoute, model: string | null = null): Promise<void> {
  let result: { data: unknown; error: unknown }
  try { result = await db.rpc('reserve_ai_provider_call', { p_route: route, ...(model ? { p_model: model } : {}) }) }
  catch { throw new AiUsageError('unavailable') }
  if (result.error) throw new AiUsageError('unavailable')
  const value = result.data as { allowed?: unknown; reason?: unknown; retry_at?: unknown } | null
  if (value?.allowed === true) return
  const reset = typeof value?.retry_at === 'string' && Number.isFinite(Date.parse(value.retry_at))
    ? new Date(value.retry_at).toISOString() : undefined
  throw new AiUsageError(typeof value?.reason === 'string' ? value.reason : 'unavailable', reset)
}

/** One reservation per outbound provider attempt, including retries/tool-loop
 * follow-ups and embeddings. Supply this only for paid provider requests. */
export function guardedAiFetch(db: UsageDb, route: GuardedAiRoute, transport: typeof fetch = fetch, estimate?: AiUsageEstimate, control?: BudgetControl): typeof fetch {
  return budgetFetch(()=>control?Promise.resolve(control):serviceBudgetControl(db),route,transport,estimate)
}

/** Settle only confirmed usage. A failed settlement keeps the conservative
 * monetary hold in place; the response remains readable by the caller. */
function budgetFetch(authority:()=>Promise<BudgetControl>,route:string,transport:typeof fetch,estimate?:AiUsageEstimate):typeof fetch {
  let control:Promise<BudgetControl>|undefined
  return async(input,init)=>{
    // No guessed audio liability in the chat beta. Those routes fail before
    // any provider call until a measured, bounded policy is supplied.
    const budget=estimate?null:textBudget(init)
    if(!budget) throw new AiUsageError('unavailable')
    let owner:BudgetControl, reservation:{allowed?:boolean;reservation_id?:string;reason?:string;retry_at?:string}
    try {
      owner=await(control??=authority())
      const result=await owner.db.rpc('reserve_ai_budget',{p_user:owner.userId,p_route:route,p_model:budget.model,p_input:budget.input,p_output:budget.output})
      if(result.error) throw new Error('Reservation failed')
      reservation=(result.data??{}) as typeof reservation
    } catch {throw new AiUsageError('unavailable')}
    if(reservation.allowed!==true||!reservation.reservation_id) throw new AiUsageError(reservation.reason??'unavailable',reservation.retry_at)
    const response=await transport(input,init) // A timeout leaves its hold intact.
    try {
      const usage=/json/i.test(response.headers.get('content-type')??'')?usageOf(await response.clone().json().catch(()=>null),budget.model):null
      if(usage || [400,401,403,404,422,429].includes(response.status)) {
        await owner.db.rpc('settle_ai_budget',{p_id:reservation.reservation_id,p_user:owner.userId,p_input:usage?.inputTokens??0,p_output:usage?.outputTokens??0})
      }
    } catch { /* The hold stays charged when settlement cannot be confirmed. */ }
    return response
  }
}

/** Background paid routes: a worker or cron charging the person it works
 *  for. Must match ai_background_routes() (migration 20261015120000). */
export const BACKGROUND_AI_ROUTES = ['email-scanner', 'extract-email', 'gmail-check', 'school-digest', 'proactive-engine', 'vault-sync', 'extract-capture', 'parse-page'] as const
export type BackgroundAiRoute = typeof BACKGROUND_AI_ROUTES[number]
type ServiceDb = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

/** Reserve on behalf of `userId` through a SERVICE-ROLE client. The database
 *  refuses this call from any other role, so a person cannot charge another. */
export async function reserveAiProviderCallFor(db: ServiceDb, userId: string, route: BackgroundAiRoute, model: string | null = null): Promise<void> {
  let result: { data: unknown; error: unknown }
  try { result = await db.rpc('reserve_ai_provider_call_for', { p_user: userId, p_route: route, ...(model ? { p_model: model } : {}) }) }
  catch { throw new AiUsageError('unavailable') }
  if (result.error) throw new AiUsageError('unavailable')
  const value = result.data as { allowed?: unknown; reason?: unknown; retry_at?: unknown } | null
  if (value?.allowed === true) return
  const reset = typeof value?.retry_at === 'string' && Number.isFinite(Date.parse(value.retry_at))
    ? new Date(value.retry_at).toISOString() : undefined
  throw new AiUsageError(typeof value?.reason === 'string' ? value.reason : 'unavailable', reset)
}

/** One reservation per outbound provider attempt, charged to `userId`. */
export function guardedAiFetchFor(db: ServiceDb, userId: string, route: BackgroundAiRoute, transport: typeof fetch = fetch, estimate?: AiUsageEstimate): typeof fetch {
  return budgetFetch(()=>Promise.resolve({userId,db}),route,transport,estimate)
}
