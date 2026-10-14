import { describe, expect, it, vi } from 'vitest'
import { AiUsageError, guardedAiFetch, reserveAiProviderCall } from './aiUsage'

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
