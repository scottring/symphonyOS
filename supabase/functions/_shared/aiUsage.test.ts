import { describe, expect, it, vi } from 'vitest'
import { guardedAiFetch, guardedAiFetchFor, modelOf, usageOf } from './aiUsage'
import { textBudget } from './aiBudget'
const init = { method:'POST', body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2048,messages:[{role:'user',content:'Hello'}]}) }
const reply = (usage:unknown={input_tokens:10,output_tokens:20},status=200)=>new Response(JSON.stringify({usage}),{status,headers:{'content-type':'application/json'}})
function fixture(decision:unknown={allowed:true,reservation_id:'r'}) {
  const rpc=vi.fn(async(name:string,_args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>=>({data:name==='reserve_ai_budget'?decision:true,error:null}))
  const db={rpc}, transport=vi.fn(async()=>reply())
  return {rpc,db,transport,fetch:guardedAiFetch(db,'symphony-agent',transport,undefined,{userId:'u',db})}
}
describe('service-authoritative funding',()=>{
  it.each([null,{allowed:'true'},{allowed:true},{allowed:false,reason:'unavailable'}])('fails closed without a reservation id: %j',async decision=>{
    const f=fixture(decision);await expect(f.fetch('https://provider.test',init)).rejects.toMatchObject({status:503});expect(f.transport).not.toHaveBeenCalled()
  })
  it.each(['daily_limit','monthly_limit'])('reports %s before any paid attempt',async reason=>{
    const f=fixture({allowed:false,reason});await expect(f.fetch('https://provider.test',init)).rejects.toMatchObject({status:429,code:`ai_${reason}`});expect(f.transport).not.toHaveBeenCalled()
  })
  it('reserves before the provider and settles cache-inclusive usage without consuming the reply',async()=>{
    const f=fixture();f.transport.mockImplementation(async()=>{expect(f.rpc).toHaveBeenCalledTimes(1);return reply({input_tokens:10,output_tokens:20,cache_creation_input_tokens:30,cache_read_input_tokens:40})})
    const r=await f.fetch('https://provider.test',init)
    expect(f.rpc).toHaveBeenNthCalledWith(1,'reserve_ai_budget',expect.objectContaining({p_user:'u',p_model:'claude-sonnet-4-6',p_output:2048}))
    expect(f.rpc).toHaveBeenNthCalledWith(2,'settle_ai_budget',{p_id:'r',p_user:'u',p_input:110,p_output:20})
    expect((await r.json()).usage.output_tokens).toBe(20)
  })
  it('keeps uncertain provider attempts charged and reserves again before retry',async()=>{
    const f=fixture();f.transport.mockRejectedValue(new Error('timeout'))
    await expect(f.fetch('https://provider.test',init)).rejects.toThrow('timeout');await expect(f.fetch('https://provider.test',init)).rejects.toThrow('timeout')
    expect(f.rpc.mock.calls.map(c=>c[0])).toEqual(['reserve_ai_budget','reserve_ai_budget'])
  })
  it('keeps the hold when usage is missing or settlement fails',async()=>{
    const f=fixture();f.transport.mockResolvedValue(reply(null));await f.fetch('https://provider.test',init);expect(f.rpc).toHaveBeenCalledTimes(1)
    f.transport.mockResolvedValue(reply());f.rpc.mockImplementation(async name=>name==='settle_ai_budget'?{data:null,error:true}:{data:{allowed:true,reservation_id:'r2'},error:null})
    expect((await f.fetch('https://provider.test',init)).ok).toBe(true)
  })
  it('settles a confirmed provider refusal at zero against its reservation',async()=>{
    const f=fixture();f.transport.mockResolvedValue(reply(null,429));await f.fetch('https://provider.test',init)
    expect(f.rpc).toHaveBeenLastCalledWith('settle_ai_budget',{p_id:'r',p_user:'u',p_input:0,p_output:0})
  })
  it('workers use the same funded service path',async()=>{
    const f=fixture();await guardedAiFetchFor(f.db,'worker-user','email-scanner',f.transport)('https://provider.test',init)
    expect(f.rpc).toHaveBeenCalledWith('reserve_ai_budget',expect.objectContaining({p_user:'worker-user',p_route:'email-scanner'}))
  })
  it('refuses requests whose liability cannot be bounded',async()=>{
    const f=fixture()
    for(const body of [{model:'x'},{model:'x',max_tokens:3,stream:true},{model:'x',max_tokens:3,messages:[{type:'image',source:'x'}]},{model:'x',max_tokens:3,tools:[{type:'web_search_20260209'}]}])
      await expect(f.fetch('https://provider.test',{body:JSON.stringify(body)})).rejects.toMatchObject({status:503})
    await expect(guardedAiFetch(f.db,'workspace-voice',f.transport,{model:'gpt-realtime',minutes:2},{userId:'u',db:f.db})('https://provider.test',init)).rejects.toMatchObject({status:503})
    expect(f.transport).not.toHaveBeenCalled()
  })
  it('bounds UTF-8 input and explicit output, including zero-output embeddings',()=>{
    expect(textBudget(init)?.input).toBeGreaterThan(init.body.length)
    expect(textBudget({body:'{"model":"text-embedding-3-small","input":"hi"}'})?.output).toBe(0)
    expect(textBudget({body:'{"model":"x","max_tokens":-1}'})).toBeNull()
  })
  it('reads both vendor usage formats',()=>{
    expect(usageOf({usage:{prompt_tokens:3,completion_tokens:2}},'gpt-4o-mini')).toEqual({model:'gpt-4o-mini',inputTokens:3,outputTokens:2,minutes:0})
    expect(usageOf({content:[]},'x')).toBeNull();expect(modelOf({body:'{"model":"x"}'})).toBe('x');expect(modelOf({body:new FormData()})).toBeNull()
  })
})
