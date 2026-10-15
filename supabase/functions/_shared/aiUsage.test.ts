import { describe, expect, it, vi } from 'vitest'
import { AiUsageError, guardedAiFetch, reserveAiProviderCall, modelOf, usageOf } from './aiUsage'

describe('paid provider admission', () => {
  it.each([
    { data: null, error: null },
    { data: { allowed: 'true' }, error: null },
    { data: { allowed: true }, error: { message: 'database unavailable' } },
    { data: { allowed: false, reason: 'unavailable' }, error: null },
  ])('fails closed without a confirmed reservation: %j', async (result) => {
    const transport = vi.fn()
    const db = { rpc: vi.fn(async () => result) }
    await expect(guardedAiFetch(db, 'symphony-agent', transport)('https://provider.test')).rejects.toMatchObject({ status: 503 })
    expect(transport).not.toHaveBeenCalled()
  })

  it('does not call a provider when the reservation service throws', async () => {
    const transport = vi.fn()
    const db = { rpc: vi.fn(async () => { throw new Error('private database detail') }) }
    await expect(guardedAiFetch(db, 'wall-say', transport)('https://provider.test')).rejects.toThrow('usage controls are not ready')
    expect(transport).not.toHaveBeenCalled()
  })

  it.each(['daily_limit', 'monthly_limit'])('reports %s with its reset and a manual route', async (reason) => {
    const db = { rpc: vi.fn(async () => ({ data: { allowed: false, reason, retry_at: '2026-11-01T00:00:00+00:00' }, error: null })) }
    await expect(reserveAiProviderCall(db, 'wall-ask')).rejects.toMatchObject({
      status: 429, code: `ai_${reason}`, retryAt: '2026-11-01T00:00:00.000Z',
      message: expect.stringContaining('view and change your plans directly'),
    })
  })

  it('reserves every attempt, including retries after an uncertain provider failure', async () => {
    const sequence: string[] = []
    const db = { rpc: vi.fn(async () => { sequence.push('reserve'); return { data: { allowed: true }, error: null } }) }
    const transport = vi.fn(async () => { sequence.push('provider'); throw new Error('timeout after submission') })
    const fetcher = guardedAiFetch(db, 'symphony-agent', transport)
    await expect(fetcher('https://provider.test')).rejects.toThrow('timeout')
    await expect(fetcher('https://provider.test')).rejects.toThrow('timeout')
    expect(sequence).toEqual(['reserve', 'provider', 'reserve', 'provider'])
    expect(db.rpc).toHaveBeenNthCalledWith(1, 'reserve_ai_provider_call', { p_route: 'symphony-agent' })
  })

  it('uses the database atomic decision when callers race for the final allowance', async () => {
    let remaining = 1
    const db = { rpc: vi.fn(async () => ({ data: remaining-- > 0 ? { allowed: true } : { allowed: false, reason: 'daily_limit' }, error: null })) }
    const transport = vi.fn(async () => new Response('ok'))
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => guardedAiFetch(db, 'wall-say', transport)('https://provider.test')))
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(outcomes.filter((o) => o.status === 'rejected').every((o) => o.reason instanceof AiUsageError)).toBe(true)
    // The separate PostgreSQL harness proves the database's decision itself.
  })
})

describe('spend ledger (cents, not only calls)', () => {
  it('names the model to the reservation and records the reply\'s token usage', async () => {
    const calls: Array<[string, Record<string, unknown>]> = []
    const db = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push([name, args]); return { data: { allowed: true }, error: null } } }
    const transport = vi.fn(async () => new Response(JSON.stringify({ model: 'claude-sonnet-4-6', usage: { input_tokens: 1200, output_tokens: 300 } }), { headers: { 'content-type': 'application/json' } }))
    const res = await guardedAiFetch(db, 'symphony-agent', transport)('https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'claude-sonnet-4-6' }) })
    expect(calls[0]).toEqual(['reserve_ai_provider_call', { p_route: 'symphony-agent', p_model: 'claude-sonnet-4-6' }])
    expect(calls[1]).toEqual(['record_ai_usage', { p_model: 'claude-sonnet-4-6', p_input: 1200, p_output: 300, p_minutes: 0, p_route: 'symphony-agent' }])
    // The reply is still readable by the caller.
    expect((await res.json()).usage.output_tokens).toBe(300)
  })
  it('OpenAI shapes and the caller\'s audio estimate are recorded too; a failed record never fails the call', async () => {
    const calls: string[] = []
    const db = { rpc: async (name: string) => { calls.push(name); return name === 'record_ai_usage' ? { data: null, error: { message: 'down' } } : { data: { allowed: true }, error: null } } }
    const openai = vi.fn(async () => new Response(JSON.stringify({ model: 'gpt-4o-mini', usage: { prompt_tokens: 50, completion_tokens: 20 } }), { headers: { 'content-type': 'application/json' } }))
    expect((await guardedAiFetch(db, 'kiosk-agent', openai)('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{"model":"gpt-4o-mini"}' })).ok).toBe(true)
    const sdp = vi.fn(async () => new Response('v=0', { headers: { 'content-type': 'application/sdp' } }))
    expect((await guardedAiFetch(db, 'workspace-voice', sdp, { model: 'gpt-realtime-2.1', minutes: 5 })('https://api.openai.com/v1/realtime/calls', { method: 'POST' })).ok).toBe(true)
    expect(calls).toEqual(['reserve_ai_provider_call', 'record_ai_usage', 'reserve_ai_provider_call', 'record_ai_usage'])
  })
  it('usageOf reads both vendors and ignores replies without usage', () => {
    expect(usageOf({ model: 'm', usage: { input_tokens: 1, output_tokens: 2 } }, null)).toEqual({ model: 'm', inputTokens: 1, outputTokens: 2, minutes: 0 })
    expect(usageOf({ usage: { prompt_tokens: 3, total_tokens: 3 } }, 'text-embedding-3-small')).toEqual({ model: 'text-embedding-3-small', inputTokens: 3, outputTokens: 0, minutes: 0 })
    expect(usageOf({ content: [] }, 'm')).toBeNull()
    expect(modelOf({ body: '{"model":"x"}' })).toBe('x')
    expect(modelOf({ body: new FormData() })).toBeNull()
  })
})
