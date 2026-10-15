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
type UsageDb = { rpc: (name: string, args: { p_route: string }) => PromiseLike<{ data: unknown; error: unknown }> }

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

export async function reserveAiProviderCall(db: UsageDb, route: GuardedAiRoute): Promise<void> {
  let result: { data: unknown; error: unknown }
  try { result = await db.rpc('reserve_ai_provider_call', { p_route: route }) }
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
export function guardedAiFetch(db: UsageDb, route: GuardedAiRoute, transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    await reserveAiProviderCall(db, route)
    return transport(input, init)
  }
}
