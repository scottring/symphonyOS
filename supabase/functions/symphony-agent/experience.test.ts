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
      ? { content: [{ type: 'text', text: 'Intermediate narration must not become the answer.' }, { type: 'tool_use', id: 'lookup', name: 'symphony_search_email', input: { query: 'school newer_than:7d' } }], stop_reason: 'tool_use' }
      : { content: [{ type: 'text', text: 'Test answer.' }], stop_reason: 'end_turn' }))
  }))
  await import('./index.ts')
  const response = await handler(new Request('https://example.invalid/agent', {
    method: 'POST', headers: { Authorization: 'Bearer new-member-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Check my school email' }] }),
  }))
  const streamed = await response.text()
  expect(streamed).not.toContain('Intermediate narration must not become the answer.')
  expect(streamed).toContain('Test answer.')
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


it('keeps identity resolution optional for capture and planning answers on the pending card',async()=>{
 const {providerBodies}=await askWithEmailResult({threads:[]})
 const policy=providerBodies[0].system.map(s=>s.text).join('\n')
 expect(policy).toContain('Capture everyday intentions without demanding a contact record')
 expect(policy).toContain('Do not guess a household member from a role')
 expect(policy).toContain('update the whole proposal before acknowledging it')
 expect(policy).toContain('ask Saturday or Sunday')
 expect(policy).toContain('A week read is not the whole task inventory')
 expect(policy).toContain('not a duplicate add')
 expect(policy).toContain('do not bypass approval during planning')
 expect(policy).not.toContain('the person to reach as contact_id (find or create the contact)')
})


async function proposalSequence(responses: unknown[]) {
 const requests: ProviderBody[]=[]
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>{
  requests.push(JSON.parse(init.body as string))
  const reply=responses[requests.length-1]
  if(!reply)throw new Error('Unexpected extra provider call')
  return new Response(JSON.stringify(reply))
 }))
 await import('./index.ts')
 const response=await handler(new Request('https://example.invalid/agent',{
  method:'POST',headers:{Authorization:'Bearer new-member-token','Content-Type':'application/json'},
  body:JSON.stringify({messages:[{role:'user',content:'Call the plumber, pick up the Amazon order, clean the yard and fit in an all-day test drive this week.'}]}),
 }))
 const events=(await response.text()).split('\n\n').filter(s=>s.startsWith('data: ')).map(s=>JSON.parse(s.slice(6)))
 return {events,requests}
}
const missingCardReply={content:[{type:'text',text:'All four items go on the card. Which day works for the test drive?'}],stop_reason:'end_turn'}
const realCard={content:[{type:'tool_use',id:'actual-card',name:'symphony_propose_changes',input:{title:'4 things this week',ops:['Call the plumber','Pick up the Amazon order','Clean the yard','All-day test drive'].map(title=>({op:'add',title}))}}],stop_reason:'tool_use'}
it('repairs a missing card in the same turn before delivering any receipt',async()=>{
 const {events,requests}=await proposalSequence([missingCardReply,realCard,{content:[{type:'text',text:'The card is ready. Which day for the test drive?'}],stop_reason:'end_turn'}])
 expect(requests).toHaveLength(3)
 expect(requests[0].system[0].text).toContain('The review button is called Save')
 expect(JSON.stringify(requests[2].messages)).toContain('The plan is unchanged until the person clicks Save')
 expect(JSON.stringify(requests[2].messages)).not.toContain('dashed on the page')
 expect(JSON.stringify(requests[1].messages)).toContain('no validated change card was produced')
 expect(events.filter(e=>e.type==='change_set')).toHaveLength(1)
 expect(events.find(e=>e.type==='change_set').set.ops).toHaveLength(4)
 expect(events.filter(e=>e.type==='text').map(e=>e.text).join('')).toBe('The card is ready. Which day for the test drive?')
 expect(requests[1].tools.some(t=>t.name==='symphony_create_task')).toBe(false)
 expect(requests[1].tools.some(t=>t.name==='symphony_propose_changes')).toBe(true)
 expect(events.find(e=>e.type==='done').outcome).toMatchObject({state:'proposed',writes:[]})
 expect(events.some(e=>e.type==='error')).toBe(false)
})
it('stops after one unsuccessful repair without emitting the unsupported receipt',async()=>{
 const {events,requests}=await proposalSequence([missingCardReply,missingCardReply])
 expect(requests).toHaveLength(2)
 expect(events.some(e=>e.type==='text'||e.type==='done'||e.type==='change_set')).toBe(false)
 expect(events.find(e=>e.type==='error')).toMatchObject({outcome:{state:'failed',writes:[]},message:expect.stringContaining('could not prepare')})
})
it('does not count a rejected proposal as evidence that a card exists',async()=>{
 const invalid={content:[{type:'tool_use',id:'bad',name:'symphony_propose_changes',input:{ops:[{op:'add',title:''}]}}],stop_reason:'tool_use'}
 const {events}=await proposalSequence([invalid,missingCardReply,missingCardReply])
 expect(events.some(e=>e.type==='change_set'||e.type==='text'||e.type==='done')).toBe(false)
 expect(events.find(e=>e.type==='error').outcome.state).toBe('failed')
})
it('ordinary clarification has no repair overhead',async()=>{
 const {events,requests}=await proposalSequence([{content:[{type:'text',text:'Which bicycle do you mean?'}],stop_reason:'end_turn'}])
 expect(requests).toHaveLength(1)
 expect(events.find(e=>e.type==='done').reply).toBe('Which bicycle do you mean?')
})


it('blocks a direct write returned during automatic proposal repair',async()=>{
 const write={content:[{type:'tool_use',id:'forbidden',name:'symphony_create_task',input:{title:'Do not save this'}}],stop_reason:'tool_use'}
 const {events,requests}=await proposalSequence([missingCardReply,write,{content:[{type:'text',text:'I could not prepare that card.'}],stop_reason:'end_turn'}])
 expect(JSON.stringify(requests[2].messages)).toContain('It cannot save changes')
 expect(events.find(e=>e.type==='tool_result'&&e.name==='symphony_create_task')).toMatchObject({ok:false})
 expect(createClient.mock.results[0].value.from.mock.calls.some(([table])=>table==='tasks')).toBe(false)
})
