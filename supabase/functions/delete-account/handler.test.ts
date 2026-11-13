import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleDeleteAccount, type DeleteAccountDeps } from './handler'

const CONFIRM = 'delete my account'

function setup(over: Partial<DeleteAccountDeps> = {}, displayIds: unknown[] = []) {
  const calls: string[] = []
  const deps: DeleteAccountDeps = {
    userFor: async () => {
      calls.push('userFor')
      return { id: 'u1', isAnonymous: false }
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

  it('403 not_a_person for an anonymous display session', async () => {
    const { deps, calls } = setup({ userFor: async () => ({ id: 'd1', isAnonymous: true }) })
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
    expect(calls).toEqual(['userFor', 'removeFiles:u1', 'deleteData:u1', 'deleteAuthUser:d1', 'deleteAuthUser:d2', 'deleteAuthUser:u1'])
  })

  it('skips display ids that are the caller or not strings', async () => {
    const { deps, calls } = setup({}, ['u1', 5, null, 'd1'])
    await handleDeleteAccount(req(), deps)
    expect(calls.filter((c) => c.startsWith('deleteAuthUser'))).toEqual(['deleteAuthUser:d1', 'deleteAuthUser:u1'])
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
    expect(calls).toContain('deleteAuthUser:u1')
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
