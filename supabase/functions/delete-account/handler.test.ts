import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleDeleteAccount, readUserLookup, type DeleteAccountDeps } from './handler'

const CONFIRM = 'delete my account'
const U1 = '6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e5f'

function setup(over: Partial<DeleteAccountDeps> = {}, displayIds: unknown[] = []) {
  const calls: string[] = []
  const deps: DeleteAccountDeps = {
    userFor: async () => {
      calls.push('userFor')
      return { kind: 'user', id: U1, isAnonymous: false }
    },
    removeFiles: async (id) => {
      calls.push(`removeFiles:${id}`)
    },
    deleteData: async (id) => {
      calls.push(`deleteData:${id}`)
      return { display_user_ids: displayIds as string[] }
    },
    deleteAuthUser: async (id) => {
      calls.push(`deleteAuthUser:${id}`)
    },
    ...over,
  }
  return { deps, calls }
}

const req = (opts: { method?: string; auth?: string | null; body?: unknown; raw?: string } = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.auth !== null) headers.Authorization = opts.auth ?? 'Bearer tok'
  const method = opts.method ?? 'POST'
  return new Request('https://example.test', {
    method,
    headers,
    body: method === 'GET' || method === 'OPTIONS' ? undefined : (opts.raw ?? JSON.stringify(opts.body ?? { confirm: CONFIRM })),
  })
}

describe('delete-account', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('answers OPTIONS with the CORS headers', async () => {
    const { deps, calls } = setup()
    const res = await handleDeleteAccount(req({ method: 'OPTIONS' }), deps)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers')).toContain('x-client-info')
    expect(calls).toEqual([])
  })

  it('rejects a GET with 405', async () => {
    const { deps, calls } = setup()
    const res = await handleDeleteAccount(req({ method: 'GET' }), deps)
    expect(res.status).toBe(405)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(calls).toEqual([])
  })

  it('401 with no Authorization header and calls nothing', async () => {
    const { deps, calls } = setup()
    const res = await handleDeleteAccount(req({ auth: null }), deps)
    expect(res.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('401 when userFor returns null, and nothing else runs', async () => {
    const { deps, calls } = setup({ userFor: async () => null })
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('410 account_gone when the sign-in\'s user no longer exists, and nothing else runs', async () => {
    const { deps, calls } = setup({
      userFor: async () => {
        calls.push('userFor')
        return { kind: 'gone' }
      },
    })
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: 'This account has already been deleted.', code: 'account_gone' })
    expect(calls).toEqual(['userFor'])
  })

  it('503 auth_unavailable when userFor throws (Auth unreachable), and nothing else runs', async () => {
    const { deps, calls } = setup({
      userFor: async () => {
        throw new Error('fetch failed')
      },
    })
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('auth_unavailable')
    expect(calls).toEqual([])
  })

  it.each([
    ['empty', ''],
    ['not a uuid', 'u1'],
    ['a path', '../other'],
    ['a uuid with a suffix', `${U1}/x`],
  ])('401 and no storage walk when the verified id is %s', async (_n, id) => {
    const { deps, calls } = setup({ userFor: async () => ({ kind: 'user', id, isAnonymous: false }) })
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('unauthorized')
    expect(calls).toEqual([])
  })

  it('403 not_a_person for an anonymous display session', async () => {
    const { deps, calls } = setup({ userFor: async () => ({ kind: 'user', id: '0b9d8c7a-6f5e-4d3c-8b2a-1f0e9d8c7b6a', isAnonymous: true }) })
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('not_a_person')
    expect(calls).toEqual([])
  })

  it.each([
    ['missing confirm', { body: {} }],
    ['wrong confirm', { body: { confirm: 'Delete my account' } }],
    ['not JSON', { raw: 'nope' }],
  ])('400 confirm_required: %s', async (_n, opts) => {
    const { deps, calls } = setup()
    const res = await handleDeleteAccount(req(opts), deps)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('confirm_required')
    expect(calls).toEqual(['userFor'])
  })

  it('happy path runs files, data, each display user, then the caller', async () => {
    const { deps, calls } = setup({}, ['d1', 'd2'])
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls).toEqual(['userFor', `removeFiles:${U1}`, `deleteData:${U1}`, 'deleteAuthUser:d1', 'deleteAuthUser:d2', `deleteAuthUser:${U1}`])
  })

  it('skips display ids that are the caller or not strings', async () => {
    const { deps, calls } = setup({}, [U1, 5, null, 'd1'])
    await handleDeleteAccount(req(), deps)
    expect(calls.filter((c) => c.startsWith('deleteAuthUser'))).toEqual(['deleteAuthUser:d1', `deleteAuthUser:${U1}`])
  })

  it('a failing display user does not stop the caller deletion', async () => {
    const { deps, calls } = setup(
      {
        deleteAuthUser: async (id) => {
          calls.push(`deleteAuthUser:${id}`)
          if (id === 'd1') throw new Error('boom')
        },
      },
      ['d1'],
    )
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(200)
    expect(calls).toContain(`deleteAuthUser:${U1}`)
  })

  it('removeFiles failing gives 500 step files and stops', async () => {
    const { deps, calls } = setup({
      removeFiles: async () => {
        throw new Error('secret storage detail')
      },
    })
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'delete_failed', step: 'files' })
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(calls).toEqual(['userFor'])
  })

  it('deleteData failing gives 500 step data and no auth deletion', async () => {
    const { deps, calls } = setup({
      deleteData: async () => {
        throw new Error('pg detail')
      },
    })
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ code: 'delete_failed', step: 'data' })
    expect(calls.some((c) => c.startsWith('deleteAuthUser'))).toBe(false)
  })

  it('deleteAuthUser(user) failing gives 500 step auth', async () => {
    const { deps } = setup({
      deleteAuthUser: async () => {
        throw new Error('auth detail')
      },
    })
    const res = await handleDeleteAccount(req(), deps)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ code: 'delete_failed', step: 'auth' })
  })
})

describe('readUserLookup (what a getUser answer means)', () => {
  const user = { id: U1, is_anonymous: false }

  it('a user is a user', () => {
    expect(readUserLookup(user, null)).toEqual({ kind: 'user', id: U1, isAnonymous: false })
    expect(readUserLookup({ id: U1, is_anonymous: true }, null)).toEqual({ kind: 'user', id: U1, isAnonymous: true })
  })

  it.each([
    ['AuthRetryableFetchError (network, status 0)', { name: 'AuthRetryableFetchError', status: 0 }],
    ['AuthRetryableFetchError (502)', { name: 'AuthRetryableFetchError', status: 502 }],
    ['status 0 by itself', { name: 'AuthError', status: 0 }],
    ['a 500 api error', { name: 'AuthApiError', status: 500, code: 'unexpected_failure' }],
    ['a 503 that also says user_not_found', { name: 'AuthApiError', status: 503, code: 'user_not_found' }],
  ])('throws when Auth itself failed: %s', (_n, error) => {
    expect(() => readUserLookup(null, error)).toThrow()
  })

  it.each([
    ['403 user_not_found (what GoTrue answers)', { name: 'AuthApiError', status: 403, code: 'user_not_found' }],
    ['404 user_not_found', { name: 'AuthApiError', status: 404, code: 'user_not_found' }],
  ])('gone only when the user does not exist: %s', (_n, error) => {
    expect(readUserLookup(null, error)).toEqual({ kind: 'gone' })
  })

  it.each([
    ['a revoked or signed-out session', { name: 'AuthSessionMissingError', status: 400 }],
    ['session_not_found', { name: 'AuthApiError', status: 403, code: 'session_not_found' }],
    ['a bad or expired JWT', { name: 'AuthApiError', status: 403, code: 'bad_jwt' }],
    ['an error with no status', { name: 'AuthUnknownError' }],
  ])('anything else that is not a user is null (401): %s', (_n, error) => {
    expect(readUserLookup(null, error)).toBeNull()
  })

  it('no user and no error is null', () => {
    expect(readUserLookup(null, null)).toBeNull()
  })
})
