import { describe, expect, it, vi } from 'vitest'
import { guardedAiFetch, guardedAiFetchFor, modelOf, usageOf } from './aiUsage'
import { searchFeeTokens, textBudget } from './aiBudget'
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
    expect(f.rpc).toHaveBeenNthCalledWith(2,'settle_ai_budget',{p_id:'r',p_user:'u',p_input:74,p_output:20})
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
    for(const body of [{model:'x'},{model:'x',max_tokens:3,stream:true},{model:'x',max_tokens:3,messages:[{type:'image_url',image_url:'x'}]},{model:'x',max_tokens:3,messages:[{role:'user',content:[{type:'image',source:{type:'url',url:'x'}},{type:'document',source:'x'}]}]},{model:'x',max_tokens:3,tools:[{type:'web_search_20260209'}]},{model:'x',max_tokens:3,tools:[{type:'web_fetch_20260209',max_uses:2}]},{model:'x',max_tokens:3,tools:[{type:'web_search_20260209',max_uses:50}]},{model:'x',max_tokens:3,tools:[{type:'code_execution_20260521',name:'code_execution'}]}])
      await expect(f.fetch('https://provider.test',{body:JSON.stringify(body)})).rejects.toMatchObject({status:503})
    await expect(guardedAiFetch(f.db,'workspace-voice',f.transport,{model:'gpt-realtime',minutes:2},{userId:'u',db:f.db})('https://provider.test',init)).rejects.toMatchObject({status:503})
    expect(f.transport).not.toHaveBeenCalled()
  })
  it('holds text at half a token per UTF-8 byte, plus fixed overhead',()=>{
    const body=(text:string)=>JSON.stringify({model:'claude-sonnet-4-6',max_tokens:3000,messages:[{role:'user',content:text}]})
    const small=textBudget({body:body('')})!.input, big=textBudget({body:body('x'.repeat(80_000))})!.input
    expect(big-small).toBe(40_000)
  })
  it('bounds UTF-8 input and explicit output, including zero-output embeddings',()=>{
    expect(textBudget(init)?.input).toBeGreaterThan(init.body.length)
    expect(textBudget({body:'{"model":"text-embedding-3-small","input":"hi"}'})?.output).toBe(0)
    expect(textBudget({body:'{"model":"x","max_tokens":-1}'})).toBeNull()
  })
  // ⌘K photos and screenshots (Scott, 2026-10-30): refused as unbounded until now.
  it('funds each Anthropic image at its visual-token ceiling, not its base64 size',()=>{
    const text=textBudget(init)!.input
    const withImage=(source:unknown)=>({body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2048,messages:[{role:'user',content:[{type:'image',source},{type:'text',text:'Hello'}]}]})})
    const url=textBudget(withImage({type:'url',url:'https://x.test/a.jpg'}))
    const base64=textBudget(withImage({type:'base64',media_type:'image/jpeg',data:'A'.repeat(400_000)}))
    expect(url?.input).toBeGreaterThanOrEqual(text+4_784)
    expect(base64?.input).toBeLessThan(text+4_784+200)
    const two=JSON.parse(withImage({type:'url',url:'u'}).body);two.messages[0].content.unshift({type:'image',source:{type:'url',url:'v'}})
    expect(textBudget({body:JSON.stringify(two)})!.input).toBeGreaterThanOrEqual(text+2*4_784)
  })
  // The assistant's web search (Scott, 2026-10-30): "check local availability, and possibly amazon".
  it('funds declared web tools at their caps, and keeps earlier web results as plain text',()=>{
    const base={model:'claude-sonnet-4-6',max_tokens:2048,messages:[{role:'user',content:'Lloyd pan near me?'}]}
    const plain=textBudget({body:JSON.stringify(base)})!.input
    const web=textBudget({body:JSON.stringify({...base,tools:[{name:'symphony_list_tasks',input_schema:{type:'object'}},{type:'web_search_20260209',name:'web_search',max_uses:3},{type:'web_fetch_20260209',name:'web_fetch',max_uses:2,max_content_tokens:10_000}]})})!.input
    expect(web-plain).toBeGreaterThanOrEqual(3*(10_000+3_334)+2*11_000)
    expect(web-plain).toBeLessThan(3*(10_000+3_334)+2*11_000+1_000)
    const history={...base,messages:[...base.messages,{role:'assistant',content:[{type:'server_tool_use',name:'web_fetch',input:{url:'https://x.test/a.pdf'}},{type:'web_fetch_tool_result',content:{type:'web_fetch_result',content:{type:'document',source:{type:'base64',media_type:'application/pdf',data:'A'.repeat(5_000)}}}}]}]}
    // Held as text at its full size: half a token per byte, like all text.
    expect(textBudget({body:JSON.stringify(history)})!.input).toBeGreaterThan(plain+2_500)
    const filtered={...base,messages:[...base.messages,{role:'assistant',content:[{type:'server_tool_use',name:'bash_code_execution',input:{command:'filter'}},{type:'bash_code_execution_tool_result',content:{type:'bash_code_execution_result',stdout:'ok'}}]}]}
    expect(textBudget({body:JSON.stringify(filtered)})).not.toBeNull()
  })
  it('charges each search its 1¢ fee as input tokens at the model’s price',()=>{
    expect(searchFeeTokens('claude-sonnet-4-6')).toBe(3_334)
    expect(searchFeeTokens('some-new-model')).toBe(10_000)
    expect(usageOf({model:'claude-sonnet-4-6',usage:{input_tokens:100,output_tokens:5,server_tool_use:{web_search_requests:2}}},null)).toMatchObject({inputTokens:100+2*3_334,outputTokens:5})
  })
  it('charges cached tokens at their real rates: reads 0.1x, 5-minute writes 1.25x, 1-hour and unsplit writes 2x',()=>{
    const usage=(u:Record<string,unknown>)=>usageOf({model:'claude-sonnet-4-6',usage:{input_tokens:100,output_tokens:10,...u}},null)!.inputTokens
    expect(usage({cache_read_input_tokens:16_000})).toBe(100+1_600)
    expect(usage({cache_read_input_tokens:40})).toBe(100+4) // exact, no float drift to 5
    expect(usage({cache_creation_input_tokens:16_000,cache_creation:{ephemeral_5m_input_tokens:16_000,ephemeral_1h_input_tokens:0}})).toBe(100+20_000)
    expect(usage({cache_creation_input_tokens:1_000,cache_creation:{ephemeral_5m_input_tokens:0,ephemeral_1h_input_tokens:1_000}})).toBe(100+2_000)
    expect(usage({cache_creation_input_tokens:1_000})).toBe(100+2_000)
    // A split larger than the total never charges more than was written.
    expect(usage({cache_creation_input_tokens:100,cache_creation:{ephemeral_5m_input_tokens:500}})).toBe(100+125)
    expect(usage({cache_read_input_tokens:1})).toBe(101) // rounds up, never down
  })
  it('prices a cached meal-chat reply near its real cost, not ten times it',()=>{
    // 2026-10-31: a ~16k-token cached prompt was ledgered at ~5¢ a reply.
    const u=usageOf({model:'claude-sonnet-4-6',usage:{input_tokens:300,output_tokens:150,cache_read_input_tokens:16_000}},null)!
    expect(u.inputTokens).toBe(1_900)
  })
  it('reads both vendor usage formats',()=>{
    expect(usageOf({usage:{prompt_tokens:3,completion_tokens:2}},'gpt-4o-mini')).toEqual({model:'gpt-4o-mini',inputTokens:3,outputTokens:2,minutes:0})
    expect(usageOf({content:[]},'x')).toBeNull();expect(modelOf({body:'{"model":"x"}'})).toBe('x');expect(modelOf({body:new FormData()})).toBeNull()
  })
})
