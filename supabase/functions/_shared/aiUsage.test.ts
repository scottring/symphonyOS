import { afterEach, describe, expect, it, vi } from 'vitest'
import { guardedAiFetch, guardedAiFetchFor, modelOf, usageOf } from './aiUsage'
import { PDF_PAGE_TOKENS, requestBudget, searchFeeTokens, textBudget } from './aiBudget'
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
    expect(f.rpc).toHaveBeenNthCalledWith(2,'settle_ai_budget',{p_id:'r',p_user:'u',p_input:74,p_output:20,p_minutes:0})
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
    expect(f.rpc).toHaveBeenLastCalledWith('settle_ai_budget',{p_id:'r',p_user:'u',p_input:0,p_output:0,p_minutes:0})
  })
  it('workers use the same funded service path',async()=>{
    const f=fixture();await guardedAiFetchFor(f.db,'worker-user','email-scanner',f.transport)('https://provider.test',init)
    expect(f.rpc).toHaveBeenCalledWith('reserve_ai_budget',expect.objectContaining({p_user:'worker-user',p_route:'email-scanner'}))
  })
  it('refuses requests whose liability cannot be bounded',async()=>{
    const f=fixture()
    for(const body of [{model:'x'},{model:'x',max_tokens:3,stream:true},{model:'x',max_tokens:3,messages:[{type:'image_url',image_url:'x'}]},{model:'x',max_tokens:3,messages:[{role:'user',content:[{type:'image',source:{type:'url',url:'x'}},{type:'document',source:'x'}]}]},{model:'x',max_tokens:3,messages:[{role:'user',content:[{type:'document',source:{type:'file',file_id:'f'}}]}]},{model:'x',max_tokens:3,tools:[{type:'web_search_20260209'}]},{model:'x',max_tokens:3,tools:[{type:'web_fetch_20260209',max_uses:2}]},{model:'x',max_tokens:3,tools:[{type:'web_search_20260209',max_uses:50}]},{model:'x',max_tokens:3,tools:[{type:'code_execution_20260521',name:'code_execution'}]}])
      await expect(f.fetch('https://provider.test',{body:JSON.stringify(body)})).rejects.toMatchObject({status:503})
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

// 2026-11-11 fixes: PDFs priced by page, the cache multiplier sent, a stated
// audio cost accepted within caps, streamed replies settled from their events.
const plainPdf=(pages:number)=>{
  let body='%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  body+=`2 0 obj\n<< /Type /Pages /Count ${pages} >>\nendobj\n`
  for(let i=0;i<pages;i++) body+=`${i+3} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n`
  return body+'%%EOF\n'
}
const pdfBody=(source:unknown,model='claude-sonnet-4-6')=>({body:JSON.stringify({model,max_tokens:2048,messages:[{role:'user',content:[{type:'text',text:'Hello'},{type:'document',source}]}]})})
const sse=(events:unknown[],{stop=true}={})=>{
  const lines=events.map(e=>`event: x\ndata: ${JSON.stringify(e)}\n\n`).join('')+(stop?'event: message_stop\ndata: {"type":"message_stop"}\n\n':'')
  // Split mid-line, as a network would.
  return new Response(new ReadableStream({start(c){const b=new TextEncoder().encode(lines);c.enqueue(b.slice(0,17));c.enqueue(b.slice(17));c.close()}}),{headers:{'content-type':'text/event-stream'}})
}
describe('2026-11-11 guard fixes',()=>{
  afterEach(()=>vi.unstubAllGlobals())
  it('prices an inline PDF by its pages, not its base64 size',async()=>{
    const text=textBudget(init)!.input
    const ten=await requestBudget(pdfBody({type:'base64',media_type:'application/pdf',data:btoa(plainPdf(10))}))
    expect(ten!.input).toBeGreaterThanOrEqual(text+10*PDF_PAGE_TOKENS)
    expect(ten!.input).toBeLessThan(text+10*PDF_PAGE_TOKENS+200)
    // A 1-page PDF padded to 300 KB is held as one page, not 150k tokens of text.
    const padded=await requestBudget(pdfBody({type:'base64',media_type:'application/pdf',data:btoa(plainPdf(1)+' '.repeat(300_000))}))
    expect(padded!.input).toBeLessThan(text+PDF_PAGE_TOKENS+200)
  })
  it('holds an uncountable PDF at the provider page limit, within the context window',async()=>{
    const unknown=await requestBudget(pdfBody({type:'base64',media_type:'application/pdf',data:btoa('%PDF-1.7 nothing countable')},'claude-haiku-4-5'))
    // Haiku: 100 pages, but never more than its 200k window.
    expect(unknown!.input).toBe(200_000)
  })
  it('fetches a storage-hosted PDF once per request and refuses one from elsewhere',async()=>{
    const storage=vi.fn(async()=>new Response(plainPdf(3),{headers:{'content-type':'application/pdf'}}))
    vi.stubGlobal('Deno',{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://proj.supabase.test':undefined}})
    vi.stubGlobal('fetch',storage)
    const f=fixture()
    const own=pdfBody({type:'url',url:'https://proj.supabase.test/storage/v1/object/sign/attachments/u/a.pdf?token=t'})
    await f.fetch('https://provider.test',own);await f.fetch('https://provider.test',own)
    expect(storage).toHaveBeenCalledTimes(1)
    const reserved=f.rpc.mock.calls.filter(c=>c[0]==='reserve_ai_budget').map(c=>c[1].p_input as number)
    expect(reserved).toHaveLength(2)
    expect(reserved[0]).toBeGreaterThanOrEqual(3*PDF_PAGE_TOKENS)
    await expect(f.fetch('https://provider.test',pdfBody({type:'url',url:'https://elsewhere.test/a.pdf'}))).rejects.toMatchObject({status:503,message:expect.stringContaining('can’t tell what it would cost')})
    expect(storage).toHaveBeenCalledTimes(1)
  })
  it('sends the cache-write multiplier the request asks for',async()=>{
    const f=fixture()
    const multiplier=async(extra:Record<string,unknown>)=>{
      await f.fetch('https://provider.test',{body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:10,messages:[{role:'user',content:'hi'}],...extra})})
      return f.rpc.mock.calls.filter(c=>c[0]==='reserve_ai_budget').at(-1)![1].p_input_multiplier
    }
    expect(await multiplier({})).toBe(1)
    expect(await multiplier({system:[{type:'text',text:'s',cache_control:{type:'ephemeral'}}]})).toBe(1.25)
    expect(await multiplier({system:[{type:'text',text:'s',cache_control:{type:'ephemeral',ttl:'1h'}}]})).toBe(2)
  })
  it('falls back to the old reservation before the migration, and refuses per-minute audio there',async()=>{
    const f=fixture()
    f.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>'p_minutes' in args?{data:null,error:{status:404}}:{data:name==='reserve_ai_budget'?{allowed:true,reservation_id:'r'}:true,error:null})
    await f.fetch('https://provider.test',init);await f.fetch('https://provider.test',init)
    expect(f.rpc.mock.calls.map(c=>[c[0],'p_minutes' in c[1]])).toEqual([['reserve_ai_budget',true],['reserve_ai_budget',false],['settle_ai_budget',false],['reserve_ai_budget',false],['settle_ai_budget',false]])
    const voice=guardedAiFetch(f.db,'workspace-voice',f.transport,{model:'gpt-realtime-2.1',minutes:2},{userId:'u',db:f.db})
    f.rpc.mockClear()
    await expect(voice('https://provider.test',{body:new FormData()})).rejects.toMatchObject({status:503})
    expect(f.transport).toHaveBeenCalledTimes(2)
  })
  it('says when the account has no household',async()=>{
    const f=fixture({allowed:false,reason:'no_household'})
    await expect(f.fetch('https://provider.test',init)).rejects.toMatchObject({status:503,code:'ai_usage_unavailable',message:expect.stringContaining('belong to a household')})
  })
  it('funds speech per character and a realtime call per minute, as stated, within caps',async()=>{
    const f=fixture()
    const say=guardedAiFetch(f.db,'wall-say',f.transport,{model:'gpt-4o-mini-tts',inputTokens:120},{userId:'u',db:f.db})
    f.transport.mockResolvedValueOnce(new Response('RIFF',{headers:{'content-type':'audio/wav'}}))
    await say('https://provider.test',{body:JSON.stringify({model:'gpt-4o-mini-tts',input:'x'})})
    expect(f.rpc).toHaveBeenNthCalledWith(1,'reserve_ai_budget',expect.objectContaining({p_model:'gpt-4o-mini-tts',p_input:120,p_output:0,p_minutes:0,p_input_multiplier:1}))
    expect(f.rpc).toHaveBeenNthCalledWith(2,'settle_ai_budget',{p_id:'r',p_user:'u',p_input:120,p_output:0,p_minutes:0})
    const call=guardedAiFetch(f.db,'workspace-voice',f.transport,{model:'gpt-realtime-2.1',minutes:2},{userId:'u',db:f.db})
    f.transport.mockResolvedValueOnce(new Response('v=0',{headers:{'content-type':'application/sdp'}}))
    await call('https://provider.test',{body:new FormData()})
    expect(f.rpc).toHaveBeenNthCalledWith(3,'reserve_ai_budget',expect.objectContaining({p_model:'gpt-realtime-2.1',p_input:0,p_minutes:2}))
    expect(f.rpc).toHaveBeenNthCalledWith(4,'settle_ai_budget',{p_id:'r',p_user:'u',p_input:0,p_output:0,p_minutes:2})
    // A refused call is settled at nothing.
    f.transport.mockResolvedValueOnce(new Response('no',{status:429}))
    await call('https://provider.test',{body:new FormData()})
    expect(f.rpc).toHaveBeenLastCalledWith('settle_ai_budget',{p_id:'r',p_user:'u',p_input:0,p_output:0,p_minutes:0})
  })
  it.each([
    [{model:'gpt-4o-mini-tts',inputTokens:5_000}],
    [{model:'gpt-4o-mini-tts',inputTokens:0}],
    [{model:'gpt-4o-mini-tts',minutes:1}],
    [{model:'gpt-realtime',minutes:6}],
    [{model:'gpt-realtime',minutes:2,inputTokens:10}],
    [{model:'gpt-4o-mini',inputTokens:10}],
  ])('refuses a stated cost outside its model’s rule: %j',async estimate=>{
    const f=fixture()
    await expect(guardedAiFetch(f.db,'wall-say',f.transport,estimate,{userId:'u',db:f.db})('https://provider.test',{body:new FormData()})).rejects.toMatchObject({status:503})
    expect(f.rpc).not.toHaveBeenCalled();expect(f.transport).not.toHaveBeenCalled()
  })
  it('refuses a stated cost for a body that names another model',async()=>{
    const f=fixture()
    await expect(guardedAiFetch(f.db,'wall-say',f.transport,{model:'gpt-4o-mini-tts',inputTokens:10},{userId:'u',db:f.db})('https://provider.test',{body:JSON.stringify({model:'gpt-4o',input:'x'})})).rejects.toMatchObject({status:503})
  })
  it('settles a finished Anthropic stream from its events and passes it through unchanged',async()=>{
    const f=fixture()
    const events=[{type:'message_start',message:{model:'claude-opus-5-5',usage:{input_tokens:100,output_tokens:1,cache_read_input_tokens:1_000}}},{type:'content_block_delta',delta:{type:'text_delta',text:'{"a":1}'}},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:250}}]
    f.transport.mockResolvedValueOnce(sse(events))
    const r=await f.fetch('https://provider.test',{body:JSON.stringify({model:'claude-opus-5-5',max_tokens:32_000,stream:true,messages:[{role:'user',content:'hi'}]})})
    expect(f.rpc).toHaveBeenCalledTimes(1) // nothing settled before the stream is read
    const text=await r.text()
    expect(text).toContain('"text":"{\\"a\\":1}"')
    expect(f.rpc).toHaveBeenLastCalledWith('settle_ai_budget',{p_id:'r',p_user:'u',p_input:200,p_output:250,p_minutes:0})
  })
  it('keeps the hold for a stream that stops before message_stop, and refuses unbounded streams',async()=>{
    const f=fixture()
    f.transport.mockResolvedValueOnce(sse([{type:'message_start',message:{usage:{input_tokens:100}}}],{stop:false}))
    await (await f.fetch('https://provider.test',{body:JSON.stringify({model:'claude-opus-5-5',max_tokens:100,stream:true,messages:[]})})).text()
    expect(f.rpc).toHaveBeenCalledTimes(1)
    // OpenAI streams report usage only when asked to.
    await expect(f.fetch('https://provider.test',{body:JSON.stringify({model:'gpt-4o-mini',max_tokens:100,stream:true,messages:[]})})).rejects.toMatchObject({status:503})
    expect(textBudget({body:JSON.stringify({model:'gpt-4o-mini',max_tokens:100,stream:true,stream_options:{include_usage:true},messages:[]})})).not.toBeNull()
  })
})
