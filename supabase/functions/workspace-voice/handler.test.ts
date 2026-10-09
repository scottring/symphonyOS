import {describe,it,expect,vi} from 'vitest'
import {handleWorkspaceVoice} from './handler'
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
