import { describe, it, expect, vi } from 'vitest'
import { saveConnection } from './saveConnection.ts'

const env = { GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g', MICROSOFT_CLIENT_ID: 'm', MICROSOFT_CLIENT_SECRET: 'm' }
const future = new Date(Date.now() + 3600_000).toISOString()

/** Google answers calendarList with the token's own primary calendar: tokens are "<email>-tok". */
const googleFetch = vi.fn(async (input: string, init?: RequestInit) => {
  const auth = new Headers(init?.headers).get('Authorization') ?? ''
  if (String(input).includes('/users/me/calendarList')) {
    const email = auth.replace('Bearer ', '').replace(/-tok$/, '')
    if (email === 'flaky') throw new TypeError('network down')
    if (email === 'dead') return new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), { status: 401 })
    return new Response(JSON.stringify({ items: [{ id: email, accessRole: 'owner', primary: true }] }))
  }
  throw new Error(`unexpected fetch ${input}`)
})

function fakeAdmin(existing: Array<Record<string, unknown>>) {
  const updates: Array<{ id: unknown; values: Record<string, unknown> }> = []
  const upserts: Array<{ values: Record<string, unknown>; onConflict: string }> = []
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: existing, error: null }) }) }),
      update: (values: Record<string, unknown>) => {
        const chain = {
          eq: (col: string, val: unknown) => { if (col === 'id') updates.push({ id: val, values }); return chain },
          then: (r: (v: { error: null }) => void) => r({ error: null }),
        }
        return chain
      },
      upsert: (values: Record<string, unknown>, options: { onConflict: string }) => {
        upserts.push({ values, onConflict: options.onConflict })
        return Promise.resolve({ error: null })
      },
    }),
  }
  return { admin: admin as never, updates, upserts }
}

const input = (email: string) => ({
  userId: 'u1', provider: 'google' as const, accessToken: `${email}-tok`, refreshToken: 'rt', expiresInSeconds: 3600, grantedScopes: 'calendar',
})

const stored = (id: string, email: string | null, extra: Record<string, unknown> = {}) => ({
  id, user_id: 'u1', provider: 'google', access_token: `${email ?? 'dead'}-tok`, refresh_token: 'rt',
  token_expires_at: future, account_email: email, is_primary: false, ...extra,
})

describe('saveConnection', () => {
  it('the first account of a provider is its primary, keyed by its email', async () => {
    const { admin, upserts } = fakeAdmin([])
    const result = await saveConnection(admin, input('me@gmail.com'), env, googleFetch as never)
    expect(result).toEqual({ error: null, accountEmail: 'me@gmail.com' })
    expect(upserts).toEqual([expect.objectContaining({
      onConflict: 'user_id,provider,account_email',
      values: expect.objectContaining({ account_email: 'me@gmail.com', is_primary: true, granted_scopes: 'calendar' }),
    })])
  })

  it('another account is added beside the first, not as primary', async () => {
    const { admin, upserts } = fakeAdmin([stored('a', 'me@gmail.com', { is_primary: true })])
    await saveConnection(admin, input('me@work.com'), env, googleFetch as never)
    expect(upserts[0].values).toMatchObject({ account_email: 'me@work.com', is_primary: false })
  })

  it('signing in to the primary account again keeps it primary', async () => {
    const { admin, upserts } = fakeAdmin([stored('a', 'me@gmail.com', { is_primary: true }), stored('b', 'me@work.com')])
    await saveConnection(admin, input('me@gmail.com'), env, googleFetch as never)
    expect(upserts[0].values).toMatchObject({ account_email: 'me@gmail.com', is_primary: true })
  })

  it('an older, unnamed row is named through its own token first, so reconnecting it refreshes it', async () => {
    const { admin, updates, upserts } = fakeAdmin([stored('legacy', null, { access_token: 'me@gmail.com-tok', is_primary: true })])
    await saveConnection(admin, input('me@gmail.com'), env, googleFetch as never)
    expect(updates).toEqual([{ id: 'legacy', values: { account_email: 'me@gmail.com' } }])
    expect(upserts[0].values).toMatchObject({ account_email: 'me@gmail.com', is_primary: true })
  })

  it('an older, unnamed row for ANOTHER account stays, and the new account is added beside it', async () => {
    const { admin, updates, upserts } = fakeAdmin([stored('legacy', null, { access_token: 'me@gmail.com-tok', is_primary: true })])
    await saveConnection(admin, input('me@work.com'), env, googleFetch as never)
    expect(updates).toEqual([{ id: 'legacy', values: { account_email: 'me@gmail.com' } }])
    expect(upserts[0].values).toMatchObject({ account_email: 'me@work.com', is_primary: false })
  })

  it('an only, unnamed row whose token is dead is the one this sign-in replaces', async () => {
    const { admin, updates, upserts } = fakeAdmin([stored('legacy', null, { is_primary: true })])
    await saveConnection(admin, input('me@work.com'), env, googleFetch as never)
    expect(updates).toEqual([{ id: 'legacy', values: { account_email: 'me@work.com' } }])
    expect(upserts[0].values).toMatchObject({ account_email: 'me@work.com', is_primary: true })
  })

  it('an only, unnamed row that cannot be read just now is left alone — never relabelled as the new account', async () => {
    const { admin, updates, upserts } = fakeAdmin([stored('legacy', null, { access_token: 'flaky-tok', is_primary: true })])
    await saveConnection(admin, input('me@work.com'), env, googleFetch as never)
    expect(updates).toEqual([])
    expect(upserts[0].values).toMatchObject({ account_email: 'me@work.com', is_primary: false })
  })

  it('refuses to store an account it cannot name', async () => {
    const { admin, upserts } = fakeAdmin([])
    const result = await saveConnection(admin, input('dead'), env, googleFetch as never)
    expect(result.error).toMatch(/which account/)
    expect(upserts).toEqual([])
  })
})
