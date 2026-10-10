import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: () => getSession() } } }))

async function load() {
  vi.resetModules()
  vi.stubEnv('VITE_OPEN_BRAIN_URL', 'https://brain.example.test')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.test')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
  return import('./openBrain')
}

describe('Open Brain client', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    getSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } } })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('calls the relay with the session, never Open Brain or a key', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ notes: [] }), { status: 200 }))
    const { fetchVaultNotes } = await load()
    await fetchVaultNotes('tasks')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://proj.supabase.test/functions/v1/open-brain-proxy/api/notes/tasks')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt', apikey: 'anon' })
    expect(JSON.stringify(init.headers)).not.toMatch(/x-api-key/i)
  })

  it('sends voice through the relay too', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: 'milk' }), { status: 200 }))
    const { transcribeVoice } = await load()
    expect(await transcribeVoice(new Blob(['x']))).toEqual({ ok: true, text: 'milk' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://proj.supabase.test/functions/v1/open-brain-proxy/api/voice/transcribe')
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer jwt', apikey: 'anon' })
  })

  it('makes no call when signed out', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const { callOpenBrain, transcribeVoice } = await load()
    expect(await callOpenBrain('/api/health')).toBeNull()
    expect(await transcribeVoice(new Blob(['x']))).toMatchObject({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
