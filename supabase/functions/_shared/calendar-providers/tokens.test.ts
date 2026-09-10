import { describe, it, expect, vi } from 'vitest'
import { buildRefreshRequest, connectionUpdateFromToken, ensureFreshAccessToken, TokenRefreshError } from './tokens.ts'
import type { CalendarConnectionRow } from './types.ts'

const env = { GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-sec', MICROSOFT_CLIENT_ID: 'm-id', MICROSOFT_CLIENT_SECRET: 'm-sec' }

const base = (provider: CalendarConnectionRow['provider'], expiresAt: string): CalendarConnectionRow => ({
  user_id: 'u1',
  provider,
  access_token: 'old',
  refresh_token: 'rt',
  token_expires_at: expiresAt,
})

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const past = new Date(Date.now() - 60 * 1000).toISOString()

describe('buildRefreshRequest', () => {
  it('a Google connection refreshes at Google with the Google client', () => {
    const { url, body } = buildRefreshRequest(base('google', past), env)
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(body.get('client_id')).toBe('g-id')
    expect(body.get('client_secret')).toBe('g-sec')
    expect(body.get('refresh_token')).toBe('rt')
    expect(body.get('grant_type')).toBe('refresh_token')
  })

  it('a Microsoft connection refreshes at the common tenant with the Microsoft client and scope', () => {
    const { url, body } = buildRefreshRequest(base('microsoft', past), env)
    expect(url).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token')
    expect(body.get('client_id')).toBe('m-id')
    expect(body.get('scope')).toContain('Calendars.Read')
  })
})

describe('connectionUpdateFromToken', () => {
  it('keeps the stored refresh token when the response has none (Google)', () => {
    const update = connectionUpdateFromToken({ access_token: 'new', expires_in: 3600 })
    expect(update.access_token).toBe('new')
    expect(update).not.toHaveProperty('refresh_token')
    expect(new Date(update.token_expires_at).getTime()).toBeGreaterThan(Date.now() + 3500 * 1000)
  })

  it('stores a rotated refresh token when the response carries one (Microsoft rotates on every refresh)', () => {
    const update = connectionUpdateFromToken({ access_token: 'new', expires_in: 3600, refresh_token: 'rt2' })
    expect(update.refresh_token).toBe('rt2')
  })
})

function fakeAdmin() {
  const updates: Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }> = []
  const admin = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          const entry = { table, values, filters: [] as Array<[string, unknown]> }
          updates.push(entry)
          const chain = {
            eq(col: string, val: unknown) {
              entry.filters.push([col, val])
              return chain
            },
            then(resolve: (v: { error: null }) => void) {
              resolve({ error: null })
            },
          }
          return chain
        },
      }
    },
  }
  return { admin, updates }
}

describe('ensureFreshAccessToken', () => {
  it('returns the stored token untouched while it has more than five minutes left', async () => {
    const { admin, updates } = fakeAdmin()
    const fetchImpl = vi.fn()
    const token = await ensureFreshAccessToken(admin as never, base('google', future), env, fetchImpl)
    expect(token).toBe('old')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it('refreshes an expiring token and writes it back to THIS provider row only', async () => {
    const { admin, updates } = fakeAdmin()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3600, refresh_token: 'rt2' })))
    const token = await ensureFreshAccessToken(admin as never, base('microsoft', past), env, fetchImpl as unknown as typeof fetch)
    expect(token).toBe('fresh')
    expect(updates).toHaveLength(1)
    expect(updates[0].table).toBe('calendar_connections')
    expect(updates[0].values).toMatchObject({ access_token: 'fresh', refresh_token: 'rt2' })
    expect(updates[0].filters).toEqual(
      expect.arrayContaining([
        ['user_id', 'u1'],
        ['provider', 'microsoft'],
      ]),
    )
  })

  it('a revoked grant is a reconnect, not a retry', async () => {
    const { admin } = fakeAdmin()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'expired' })))
    await expect(
      ensureFreshAccessToken(admin as never, base('google', past), env, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ name: 'TokenRefreshError', shouldDisconnect: true, message: 'expired' })
  })

  it('a transient refresh failure is NOT a reconnect', async () => {
    const { admin } = fakeAdmin()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'temporarily_unavailable' })))
    const err = await ensureFreshAccessToken(admin as never, base('google', past), env, fetchImpl as unknown as typeof fetch).catch((e) => e)
    expect(err).toBeInstanceOf(TokenRefreshError)
    expect(err.shouldDisconnect).toBe(false)
  })
})
