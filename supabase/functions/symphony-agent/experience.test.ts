// Actual agent request boundary with auth/provider doubles. This checks the
// instructions and tool evidence sent to the model, not generated reply quality.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_GROUNDING_RULES, ASSISTANT_PERSONALITY, RESULT_LANGUAGE_RULES } from '../_shared/assistantExperience'
import { handleWorkspaceVoice } from '../workspace-voice/handler'
import { buildWallPrompt } from '../wall-ask/prompt'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient }))

type Handler = (request: Request) => Promise<Response>
type ProviderBody = { system: { text: string }[]; tools: { name: string; description?: string }[]; messages: unknown[] }
let handler: Handler
const values: Record<string, string> = {
  SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'public-test-key', ANTHROPIC_API_KEY: 'test-only',
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => values[name] },
    serve: (next: Handler) => { handler = next },
  })
  createClient.mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'new-member' } }, error: null }) },
    from: vi.fn(() => ({ select: () => ({ order: () => Promise.resolve({ data: [] }) }) })),
    rpc: vi.fn(async () => ({ data: { allowed: true }, error: null })),
  })
})
afterEach(() => vi.unstubAllGlobals())

async function askWithEmailResult(emailBody: unknown, status = 200) {
  const providerBodies: ProviderBody[] = []
  const emailRequests: RequestInit[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/gmail-event-threads')) {
      emailRequests.push(init)
      return new Response(JSON.stringify(emailBody), { status })
    }
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    providerBodies.push(JSON.parse(init.body as string))
    return new Response(JSON.stringify(providerBodies.length === 1
      ? { content: [{ type: 'tool_use', id: 'lookup', name: 'symphony_search_email', input: { query: 'school newer_than:7d' } }], stop_reason: 'tool_use' }
      : { content: [{ type: 'text', text: 'Test answer.' }], stop_reason: 'end_turn' }))
  }))
  await import('./index.ts')
  const response = await handler(new Request('https://example.invalid/agent', {
    method: 'POST', headers: { Authorization: 'Bearer new-member-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Check my school email' }] }),
  }))
  await response.text()
  expect(response.status).toBe(200)
  expect(providerBodies).toHaveLength(2)
  return { providerBodies, emailRequests }
}

describe('one Symphony experience without seed-account assumptions', () => {
  it('sends the same personality and result rules through text, live voice and wall answers', async () => {
    const { providerBodies } = await askWithEmailResult({ threads: [], mailbox: 'member@example.test' })
    let voiceInstructions = ''
    const voiceValues: Record<string, string> = { WORKSPACE_VOICE_ENABLED: '1', WORKSPACE_VOICE_USER_IDS: 'new-member', OPENAI_API_KEY: 'test-only' }
    const response = await handleWorkspaceVoice(new Request('https://example.invalid/voice', {
      method: 'POST', headers: { Authorization: 'Bearer new-member-token', 'Content-Type': 'application/sdp' }, body: 'v=0\r\n',
    }), {
      env: (name) => voiceValues[name],
      userId: async () => 'new-member', reserve: async () => true,
      fetch: async (_url, init) => {
        voiceInstructions = JSON.parse((init!.body as FormData).get('session') as string).instructions
        return new Response('answer')
      },
    })
    expect(response.status).toBe(200)
    const textInstructions = providerBodies[0].system[0].text
    for (const instructions of [textInstructions, voiceInstructions, buildWallPrompt('What is next?', 'Lunch at noon.').system]) {
      expect(instructions).toContain(ASSISTANT_PERSONALITY)
      expect(instructions).toContain(RESULT_LANGUAGE_RULES)
    }
    for (const instructions of [textInstructions, voiceInstructions]) {
      expect(instructions).toContain(ACCOUNT_GROUNDING_RULES)
      expect(instructions).not.toMatch(/Scott['’]s|Gmail is connected and searchable|Never reply that you have no access to email/)
    }
    const noteTool = providerBodies[0].tools.find((tool) => tool.name === 'symphony_search_notes')
    expect(noteTool?.description).toContain('signed-in person')
    expect(noteTool?.description).not.toContain('Scott')
  })

  it.each([
    [400, 'No Google connection found. Connect Google with Gmail scope.'],
    [403, 'Gmail access not authorized.'],
    [503, 'Email temporarily unavailable.'],
  ])('preserves failed access (%i) as a failure, not an empty mailbox', async (status, error) => {
    const { providerBodies, emailRequests } = await askWithEmailResult({ error }, status)
    const evidence = JSON.stringify(providerBodies[1].messages)
    expect(evidence).toContain(status === 403 ? 'Gmail access is not authorized' : error)
    expect(evidence).not.toContain('No email threads')
    expect(emailRequests[0].headers).toEqual({ Authorization: 'Bearer new-member-token', 'Content-Type': 'application/json' })
  })

  it.each(['member@example.test', null])('limits a successful empty search to its returned mailbox (%s)', async (mailbox) => {
    const { providerBodies } = await askWithEmailResult({ threads: [], mailbox })
    const evidence = JSON.stringify(providerBodies[1].messages)
    expect(evidence).toContain('No email threads')
    expect(evidence).toContain('Only this mailbox was checked')
    expect(evidence).not.toContain('only one Symphony is connected to')
    if (mailbox) expect(evidence).toContain(mailbox)
    else expect(evidence).not.toContain('@gmail.com')
  })
})
