import { describe, it, expect, vi } from 'vitest'
import { recordHealth } from './health'
import type { Config } from './types'

const config: Config = {
  supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'svc', captureSecret: 'sec',
  userEmail: 'a@b.com', userId: 'u-1', timezone: 'America/New_York',
  stateDir: '/tmp', flushHoursLocal: [12, 20],
}

const mock = () => {
  const upsert = vi.fn(async () => ({ error: null }))
  return { client: { from: vi.fn(() => ({ upsert })) }, upsert }
}

describe('recordHealth', () => {
  it('stamps last_ok_at and clears the previous error on success', async () => {
    const { client, upsert } = mock()
    await recordHealth(config, 'whatsapp', { ok: true }, client as never)

    expect(client.from).toHaveBeenCalledWith('connector_health')
    const row = upsert.mock.calls[0]![0] as Record<string, unknown>
    expect(row.user_id).toBe('u-1')
    expect(row.connector).toBe('whatsapp')
    expect(row.last_ok_at).toBeTruthy()
    expect(row.last_error).toBeNull()
  })

  it('records the error without touching last_ok_at on failure', async () => {
    const { client, upsert } = mock()
    await recordHealth(config, 'classdojo', { ok: false, error: 'login failed: 403' }, client as never)

    const row = upsert.mock.calls[0]![0] as Record<string, unknown>
    expect(row.last_error).toBe('login failed: 403')
    expect(row.last_ok_at).toBeUndefined()
  })

  it('upserts on the composite key so one row per connector survives', async () => {
    const { client, upsert } = mock()
    await recordHealth(config, 'whatsapp', { ok: true }, client as never)
    expect(upsert.mock.calls[0]![1]).toEqual({ onConflict: 'user_id,connector' })
  })
})
