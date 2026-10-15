/** Provider-call admission, not a token/dollar budget. No local fallback: a
 * missing migration/configuration or failed reservation means no paid call. */
/** Every interactive paid route (the caller is a signed-in person). Must match
 *  the allowlist in reserve_ai_provider_call (migration 20261015110000). */
export const GUARDED_AI_ROUTES = [
  'symphony-agent', 'workspace-voice', 'wall-ask', 'wall-say',
  'analyze-attachment', 'analyze-capture', 'analyze-link', 'extract-capture', 'parse-page', 'plan-from-paper', 'routine-from-doc',
  'goal-planning-chat', 'planning-conversation', 'tend-week', 'sharpen-goal', 'suggest-waiting-for', 'rhythms-parse',
  'kiosk-agent', 'math-story', 'meal-planner-chat', 'meal-slot-suggest', 'semantic-search', 'note-match',
] as const
export type GuardedAiRoute = typeof GUARDED_AI_ROUTES[number]
type UsageDb = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

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
  const input = n(u.input_tokens ?? u.prompt_tokens)
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
export function guardedAiFetch(db: UsageDb, route: GuardedAiRoute, transport: typeof fetch = fetch, estimate?: AiUsageEstimate): typeof fetch {
  return async (input, init) => {
    const model = estimate?.model ?? modelOf(init)
    await reserveAiProviderCall(db, route, model)
    const res = await transport(input, init)
    await recordUsage((args) => db.rpc('record_ai_usage', { ...args, p_route: route }), res, model, estimate)
    return res
  }
}

/** Record what the reply says it cost (or the caller's estimate). Best effort:
 *  a failed record never fails the call, and the reply is never consumed. */
async function recordUsage(record: (args: Record<string, unknown>) => PromiseLike<unknown>, res: Response, model: string | null, estimate?: AiUsageEstimate): Promise<void> {
  try {
    let usage: AiUsageRecord | null = null
    // A refused or failed attempt costs nothing at the provider; an estimate
    // charged anyway locked a household out of voice after two tries (2026-10-15).
    if (!res.ok) return
    if (estimate) usage = { model: estimate.model, inputTokens: estimate.inputTokens ?? 0, outputTokens: estimate.outputTokens ?? 0, minutes: estimate.minutes ?? 0 }
    else if (res.ok && /json/i.test(res.headers.get('content-type') ?? '')) usage = usageOf(await res.clone().json().catch(() => null), model)
    if (!usage) return
    await record({ p_model: usage.model, p_input: usage.inputTokens, p_output: usage.outputTokens, p_minutes: usage.minutes })
  } catch { /* the ledger is for limits and reports; the person's request comes first */ }
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
  return async (input, init) => {
    const model = estimate?.model ?? modelOf(init)
    await reserveAiProviderCallFor(db, userId, route, model)
    const res = await transport(input, init)
    await recordUsage((args) => db.rpc('record_ai_usage_for', { p_user: userId, ...args, p_route: route }), res, model, estimate)
    return res
  }
}
