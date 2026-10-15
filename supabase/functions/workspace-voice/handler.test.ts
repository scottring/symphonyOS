import {describe,it,expect,vi} from 'vitest'
import {handleWorkspaceVoice,transcriptionPrompt} from './handler'
const request=()=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer user','Content-Type':'application/sdp'},body:'v=0\r\n'})
function setup(over:Record<string,string>={}){
 const values:Record<string,string>={WORKSPACE_VOICE_ENABLED:'1',WORKSPACE_VOICE_USER_IDS:'pilot',OPENAI_API_KEY:'test-secret',...over}
 return {env:(key:string)=>values[key],userId:vi.fn(async()=> 'pilot'),reserve:vi.fn(async()=>true),fetch:vi.fn(async()=>new Response('answer'))}
}
describe('workspace voice handshake',()=>{
 it('answers preflight without authentication or spending',async()=>{
  const deps=setup();const response=await handleWorkspaceVoice(new Request('https://example.test',{method:'OPTIONS'}),deps)
  expect(response.status).toBe(204);expect(response.headers.get('access-control-allow-headers')).toContain('x-client-info');expect(deps.fetch).not.toHaveBeenCalled()
 })
 it('denies disabled and non-pilot accounts before calling the provider',async()=>{
  for(const config of [{WORKSPACE_VOICE_ENABLED:'0'},{WORKSPACE_VOICE_USER_IDS:'someone-else'}]){
   const deps=setup(config);expect((await handleWorkspaceVoice(request(),deps)).status).toBe(503);expect(deps.fetch).not.toHaveBeenCalled()
  }
 })
 it('rejects invalid sessions',async()=>{
  const deps=setup();deps.userId.mockRejectedValue(new Error('expired'))
  expect((await handleWorkspaceVoice(request(),deps)).status).toBe(401);expect(deps.fetch).not.toHaveBeenCalled()
 })
 it('keeps provider credentials out of the response',async()=>{
  const deps=setup();const response=await handleWorkspaceVoice(request(),deps)
  expect(response.status).toBe(200);expect(await response.text()).toBe('answer')
  expect(response.headers.get('x-voice-max-seconds')).toBe('300')
  expect(JSON.stringify([...response.headers])).not.toContain('test-secret')
  expect(deps.fetch).toHaveBeenCalledTimes(1)
 })
 it('starts the current model, transcribing in English with noise reduction',async()=>{
  const deps=setup();await handleWorkspaceVoice(request(),deps)
  const session=JSON.parse(((deps.fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body as FormData).get('session') as string)
  expect(session.model).toBe('gpt-realtime-2.1')
  expect(session.audio.input.transcription).toEqual({model:'gpt-4o-mini-transcribe',language:'en'})
  expect(session.audio.input.noise_reduction).toEqual({type:'near_field'})
 })
 it('lets the person end their turn: speech is split for the transcript, but nothing answers by itself',async()=>{
  const deps=setup();await handleWorkspaceVoice(request(),deps)
  const session=JSON.parse(((deps.fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body as FormData).get('session') as string)
  expect(session.audio.input.turn_detection).toMatchObject({type:'server_vad',create_response:false,interrupt_response:false})
 })
 it('keeps the voice short and the plan the person\'s own',async()=>{
  const deps=setup();await handleWorkspaceVoice(request(),deps)
  const session=JSON.parse(((deps.fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body as FormData).get('session') as string)
  expect(session.max_output_tokens).toBe(400)
  expect(session.audio.output).toEqual({voice:'marin',speed:1})
  expect(session.instructions).toContain('Never suggest goals, tasks or activities they did not say')
  expect(session.instructions).toContain('One or two short sentences a turn')
 })
 it('lets the planning agent lead sessions, with the shared spine',async()=>{
  const deps=setup();await handleWorkspaceVoice(request(),deps)
  const session=JSON.parse(((deps.fetch.mock.calls[0] as unknown as [string,RequestInit])[1].body as FormData).get('session') as string)
  expect(session.instructions).toContain('the planning agent leads them')
  expect(session.instructions).toContain('Sessions follow a spine, not a script')
  expect(session.instructions).toContain('Everyday talk:')
  // Never a false "done": every change goes through ask_symphony first (2026-10-14).
  expect(session.instructions).toContain('You cannot change anything yourself.')
  expect(session.instructions).toContain('unless ask_symphony returned in this turn and its result says it was saved')
  expect(session.instructions).not.toContain('Shape of planning')
  expect(session.instructions).toContain('forward the request to ask_symphony and say its result in a few words')
  expect(session.instructions).toContain('During a session, never ask your own questions')
  expect(session.instructions).toContain('say its reply naturally, keeping its meaning and any options it offers')
  expect(session.instructions).toContain("don't call show_on_page")
  expect(session.instructions).toContain('the planning agent does this')
  expect(session.instructions).not.toContain('light them up on the page')
  expect(session.instructions).not.toContain('Clear and about one item: just do it')
 })
 it('stops at the daily limit without spending',async()=>{
  const deps=setup();deps.reserve.mockResolvedValue(false)
  expect((await handleWorkspaceVoice(request(),deps)).status).toBe(429);expect(deps.fetch).not.toHaveBeenCalled()
 })
 it('does not leak provider error bodies',async()=>{
  const deps=setup();deps.fetch.mockResolvedValue(new Response('private-provider-detail',{status:400}))
  expect(await (await handleWorkspaceVoice(request(),deps)).text()).toBe('voice_unavailable')
 })
})

it('discovers pilot access without provider calls or quota consumption',async()=>{
 for(const allowed of ['pilot','someone-else']){
  const deps=setup({WORKSPACE_VOICE_USER_IDS:allowed})
  const result=await handleWorkspaceVoice(new Request('https://example.test',{headers:{Authorization:'Bearer user'}}),deps)
  expect(await result.json()).toEqual({enabled:allowed==='pilot'})
  expect(deps.reserve).not.toHaveBeenCalled();expect(deps.fetch).not.toHaveBeenCalled()
 }
})

describe('household vocabulary for the transcriber',()=>{
 it('passes the family\'s names and routine names as the transcription prompt, bounded and deduplicated',async()=>{
  const deps={...setup(),vocabulary:vi.fn(async()=>['Kaleb','Ella','kaleb','Piano practice','',' '.repeat(3),'x'.repeat(41)])}
  await handleWorkspaceVoice(request(),deps)
  const form=(deps.fetch as unknown as {mock:{calls:[[string,{body:FormData}]]}}).mock.calls[0][1].body
  const session=JSON.parse(String(form.get('session')))
  expect(session.audio.input.transcription.prompt).toBe('Kaleb, Ella, Piano practice')
 })
 it('a failed vocabulary read never blocks the call',async()=>{
  const deps={...setup(),vocabulary:vi.fn(async()=>{throw new Error('down')})}
  expect((await handleWorkspaceVoice(request(),deps)).status).toBe(200)
 })
 it('transcriptionPrompt is empty with nothing to say',()=>{
  expect(transcriptionPrompt([])).toBeUndefined()
 })
 it('transcriptionPrompt is a bare word list without sign-in addresses, so an echo is never mistaken for speech',()=>{
  expect(transcriptionPrompt(['Jerry Salve','Rita','smkaufman+bench-a2','a@b.c','rita'])).toBe('Jerry Salve, Rita')
 })
})
