// Continuous recorded speech -> production voice tools -> deployed agent ->
// actual browser activity/applier -> scoped synthetic database -> spoken Undo.
// WebSocket/manual turn boundaries bypass physical microphone and WebRTC/VAD.
import WebSocket from 'ws'
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
import {chromium} from '@playwright/test'
import {readPcmWav} from './audio.mjs'
import {workspaceVoiceTools,workspaceVoiceInstructions,handleWorkspaceVoice} from '../../supabase/functions/workspace-voice/handler'
const env=(p:string)=>Object.fromEntries(readFileSync(p,'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'')]))
const dir=process.env.BENCH_ENV_DIR
if(!dir||!process.env.OPENAI_API_KEY)throw new Error('Existing synthetic configuration and API key required')
const spend=JSON.parse(readFileSync(new URL('./reports/spend.json',import.meta.url),'utf8'))
// Reserve a deliberately conservative $0.75 for this single bounded run. No retries.
if(spend.estimatedCombinedUsd+.75>spend.authorizedCapUsd)throw new Error('Insufficient remaining authorized budget')
const cfg=env(resolve(dir,'.env.production')),accounts=env(resolve(dir,'.env.bench'))
assert.match(accounts.BENCH_A1_EMAIL,/\+|synthetic/)
const url=cfg.VITE_SUPABASE_URL,anon=cfg.VITE_SUPABASE_ANON_KEY
const auth=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:accounts.BENCH_A1_EMAIL,password:accounts.BENCH_A1_PASSWORD})})
assert.ok(auth.ok,`Synthetic sign-in ${auth.status}`)
const session=await auth.json(),token=session.access_token,userId=session.user.id
const headers={apikey:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
const rest=async(path:string,method='GET')=>{const r=await fetch(`${url}/rest/v1/${path}`,{method,headers,signal:AbortSignal.timeout(20000)});assert.ok(r.ok,`Database ${r.status}`);return method==='DELETE'?null:r.json()}
const rows=()=>rest('tasks?select=*&order=id')
const before=await rows();assert.ok(before.length<1000,'Baseline must be complete')
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const friday=new Date(`${today}T12:00:00Z`);friday.setUTCDate(friday.getUTCDate()+(5-friday.getUTCDay()+7)%7)
const targetDate=friday.toISOString().slice(0,10)
const browserTransport=process.env.BENCH_REAL_WEBRTC==='1'
const interrupt=browserTransport&&process.env.BENCH_INTERRUPT==='1'
const report:any={interruptDuringReply:interrupt,transport:browserTransport?'production WebRTC + explicit Done':'WebSocket + manual commit',at:new Date().toISOString(),agentFunction:process.env.BENCH_AGENT_FUNCTION??'symphony-agent',scope:'explicit-send recorded voice; real voice handler, deployed agent, browser provider/applier and scoped REST writers; synthetic audio source, no physical microphone',steps:[],usage:[],agentTurns:0,cleanup:[],status:'running'}
const messages:any[]=[],cards:any[]=[],created=new Set<string>()
let browser:any,page:any,ws:WebSocket|undefined,active:any,send:any
const fail=(error:Error)=>{if(active){clearTimeout(active.timer);const reject=active.reject;active=null;reject(error)}}
spend.estimatedCombinedUsd+=.75;spend.voiceDatabaseReservedUsd=(spend.voiceDatabaseReservedUsd??0)+.75
writeFileSync(new URL('./reports/spend.json',import.meta.url),JSON.stringify(spend,null,2)+'\n')
try{
 browser=await chromium.launch({channel:'chrome',headless:true})
 page=await browser.newPage({timezoneId:'America/New_York'});page.setDefaultTimeout(15000)
 await page.exposeFunction('__benchAsk',async(request:string)=>{
  assert.ok(report.agentTurns<2,'Only capture/correction may call agent in this journey');report.agentTurns++
  messages.push({role:'user',content:request})
  const last=cards.at(-1)
  const r=await fetch(`${url}/functions/v1/${process.env.BENCH_AGENT_FUNCTION??'symphony-agent'}`,{method:'POST',headers,signal:AbortSignal.timeout(45000),body:JSON.stringify({messages,turnId:crypto.randomUUID(),workspaceContext:{page:'week',date:today,layers:['family'],items:[],truncated:true},...(last?{changeCard:{state:'pending',title:last.title,ops:last.ops.map((o:any)=>({op:o.op,title:o.title,taskId:o.taskId,date:o.date,time:o.time,where:o.date??''})),at:new Date().toISOString()}}:{})})})
  assert.ok(r.ok,`Agent ${r.status}`)
  const events=(await r.text()).split('\n\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)))
  const done=events.find(e=>e.type==='done'),card=events.filter(e=>e.type==='change_set').at(-1)?.set
  report.steps.push({name:'agent-attempt',request,reply:done?.reply,outcome:done?.outcome,card,errors:events.filter(e=>e.type==='error')})
  assert.ok(done,events.find(e=>e.type==='error')?.message??'Planner did not return a completion')
  assert.equal(done?.outcome?.state,'proposed');assert.equal(card?.ops?.length,4)
  assert.ok(card.ops.every((o:any)=>o.op==='add'),'Never authorize edits to pre-existing records')
  for(const term of ['plumber','Amazon','yard','test drive'])assert.equal(card.ops.filter((o:any)=>o.title.toLowerCase().includes(term.toLowerCase())).length,1,`Exact one ${term}`)
  if(cards.length)assert.equal(card.ops.find((o:any)=>/plumber/i.test(o.title)).date,targetDate,'Correction date')
  await page.waitForFunction(()=>typeof (window as any).__benchVoice==='function')
  assert.deepEqual(await rows(),before,'No writes before spoken approval')
  cards.push(card);messages.push({role:'assistant',content:done.reply});report.steps.push({name:`agent-${cards.length}`,request,card,status:'passed'})
  return {reply:done.reply,outcome:done.outcome,card}
 })
 await page.addInitScript((config:any)=>{(window as any).__benchLive=config},{voice:true,url,anon,token,userId,scenario:{id:`voice-${Date.now()}`,start:{tasks:[],routines:[],members:[]},stages:[]}})
 await page.goto(`${process.env.BENCH_PREVIEW_URL??'http://127.0.0.1:5183'}/scripts/conversation-bench/transaction-preview.html`)
 await page.waitForFunction(()=>typeof (window as any).__benchVoice==='function')
 const executeAction=async(name:string,args:unknown)=>{
  assert.equal(active.called,false,'One tool per turn');assert.equal(name,browserTransport?'ask_symphony':active.expectedTool)
  active.called=true;active.call={name,args}
     const result=await page.evaluate(async({name,args}:any)=>(window as any).__benchVoice(name,args),active.call)
     assert.equal(result.outcome?.state,active.expectedOutcome,'Action outcome')
     active.result=result
     // Evidence must be read from the database BEFORE giving voice its success result.
     const observed=await rows()
     if(active.id==='approve'){
      const added=observed.filter((t:any)=>!before.some((b:any)=>b.id===t.id))
      for(const t of added)if(t.user_id===userId)created.add(t.id)
      assert.equal(added.length,4);assert.deepEqual(added.map((t:any)=>t.title).sort(),cards.at(-1).ops.map((o:any)=>o.title).sort())
      assert.deepEqual(observed.filter((t:any)=>before.some((b:any)=>b.id===t.id)),before,'Bystanders unchanged')
      const plumber=added.find((t:any)=>/plumber/i.test(t.title));assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(plumber.scheduled_for)),targetDate)
     }else assert.deepEqual(observed,before,active.id==='undo'?'Undo restores baseline':'Proposal never writes')
     active.databaseVerified=true

 return result
 }
 if(!browserTransport){
 ws=new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1',{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}})
 send=(event:any)=>ws!.send(JSON.stringify(event))
 const ready=new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Voice session timeout')),15000)
  ws!.on('error',()=>{clearTimeout(timer);reject(new Error('Voice connection failed'));fail(new Error('Voice connection failed'))})
  ws!.on('close',()=>{clearTimeout(timer);reject(new Error('Voice connection closed'));fail(new Error('Voice connection closed'))})
  ws!.on('message',async raw=>{try{
   const e=JSON.parse(String(raw))
   if(e.type==='error'){clearTimeout(timer);const err=new Error(`Voice API ${e.error?.code??'error'}`);reject(err);return fail(err)}
   if(e.type==='session.updated'){clearTimeout(timer);resolve();return}
   if(!active)return
   if(e.type==='conversation.item.input_audio_transcription.completed')active.heard=e.transcript
   if(e.type==='response.done'){
    if(e.response?.usage)report.usage.push(e.response.usage)
    assert.equal(e.response.status,'completed','Voice response must complete')
    const calls=(e.response.output??[]).filter((x:any)=>x.type==='function_call')
    if(calls.length){
     assert.equal(calls.length,1)
     const call=calls[0];assert.equal(call.name,active.expectedTool)
     const result=await executeAction(call.name,JSON.parse(call.arguments))
     send({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)}});send({type:'response.create'})
    }else{
     assert.ok(active.called,'Required action missing')
     const reply=(e.response.output??[]).flatMap((o:any)=>o.content??[]).map((x:any)=>x.transcript??x.text??'').join(' ')
     assert.match(reply,active.replyPattern,'Spoken outcome')
     const result={id:active.id,heard:active.heard,reply,call:active.call,result:active.result,databaseVerified:active.databaseVerified,status:'passed'}
     clearTimeout(active.timer);const finish=active.resolve;active=null;finish(result)
    }
   }
  }catch(error){fail(error as Error)}})
  ws!.on('open',()=>send({type:'session.update',session:{type:'realtime',model:'gpt-realtime-2.1',instructions:workspaceVoiceInstructions,max_output_tokens:400,tools:workspaceVoiceTools,audio:{input:{format:{type:'audio/pcm',rate:24000},transcription:{model:'gpt-4o-mini-transcribe',language:'en'},noise_reduction:{type:'near_field'},turn_detection:null},output:{voice:'marin',speed:1}}}}))
 })
 await ready
 }else{
  await page.exposeFunction('__benchOffer',async(sdp:string)=>{
   const response=await handleWorkspaceVoice(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/sdp'},body:sdp}),{
    env:key=>({WORKSPACE_VOICE_ENABLED:'1',WORKSPACE_VOICE_USER_IDS:'synthetic',OPENAI_API_KEY:process.env.OPENAI_API_KEY} as any)[key],
    userId:async()=> 'synthetic',reserve:async()=>true,fetch,
   })
   return {status:response.status,body:await response.text(),headers:Object.fromEntries(response.headers)}
  })
  await page.exposeFunction('__benchTool',async(name:string,args:unknown)=>{
   try{const result=await executeAction(name,args);await page.evaluate(()=>{(window as any).__benchActionVerified=true});return result}catch(error){report.toolError=(error as Error).message;throw error}
  })
  await page.evaluate(()=>(window as any).__benchStartTransport())
  await page.waitForFunction(()=>(window as any).__benchTransportEvents.some((e:any)=>e.type==='turn'&&e.turn==='listening'))
  await page.evaluate(wav=>(window as any).__benchPlayAudio(wav),[...readFileSync(new URL('./audio-fixtures/silence.wav',import.meta.url))])
  await delay(2500)
  assert.equal(await page.evaluate(()=>(window as any).__benchTransportEvents.filter((e:any)=>e.type==='user').length),0,'Silence produces no captions')
  assert.equal(report.agentTurns,0,'Silence starts no transactions')
  report.steps.push({id:'silence-through-VAD',status:'passed'})
 }
 for(const c of [
  {id:'capture',tool:'ask_symphony',outcome:'proposed',reply:/card|propos|approv/i},
  {id:'correction',tool:'ask_symphony',outcome:'proposed',reply:/Friday|card|updat/i},
  {id:'approve',clip:'approve-changes',tool:'approve_card',outcome:'saved',reply:/saved|added/i},
  {id:'undo',tool:'undo_last_change',outcome:'saved',reply:/undone|revert|removed|back/i},
 ].slice(0,interrupt?1:4)){
  if(browserTransport){
   active={id:c.id,expectedTool:c.tool,expectedOutcome:c.outcome,called:false}
   await page.evaluate(()=>{(window as any).__benchTransportEvents=[];(window as any).__benchActionVerified=false})
   await page.evaluate(wav=>(window as any).__benchPlayAudio(wav),[...readFileSync(new URL(`./audio-fixtures/${c.clip??c.id}.wav`,import.meta.url))])
   await page.waitForFunction(()=>(window as any).__benchTransportEvents.some((e:any)=>e.type==='user'),{},{timeout:15000})
   await page.evaluate(()=>(window as any).__benchDone())
   if(interrupt){
    await page.waitForFunction(()=>(window as any).__benchActionVerified && (window as any).__benchTransportEvents.filter((e:any)=>e.type==='speaking'&&e.who==='assistant').at(-1)?.active,{},{timeout:30000})
    assert.ok(active.databaseVerified)
    assert.equal(await page.evaluate(()=>(window as any).__benchEndTransport()),true)
    const eventCount=await page.evaluate(()=>(window as any).__benchTransportEvents.length)
    await delay(2000)
    assert.equal(await page.evaluate(()=>(window as any).__benchTransportEvents.length),eventCount,'No late speech/status callbacks after End')
    assert.deepEqual(await rows(),before,'Interrupted proposal never persists')
    report.steps.push({id:'End-during-spoken-reply',status:'passed',databaseVerified:true})
    active=null;console.log('PASS End during real spoken reply; no late events or database writes')
    break
   }
   await page.waitForFunction(()=>(window as any).__benchTransportEvents.some((e:any)=>e.type==='assistant'&&e.final)&& (window as any).__benchTransportEvents.some((e:any)=>e.type==='turn'&&e.turn==='listening'),{},{timeout:30000})
   if(report.toolError)throw new Error(report.toolError)
   assert.ok(active.databaseVerified,'Action and database must be verified')
   const events=await page.evaluate(()=>(window as any).__benchTransportEvents)
   const reply=events.filter((e:any)=>e.type==='assistant'&&e.final).at(-1)?.text??''
   assert.match(reply,c.reply)
   report.steps.push({id:c.id,call:active.call,result:active.result,reply,events,databaseVerified:true,status:'passed'})
   active=null;console.log(`PASS browser WebRTC voice ${c.id}`)
   continue
  }
  const pcm=readPcmWav(readFileSync(new URL(`./audio-fixtures/${c.clip??c.id}.wav`,import.meta.url)))
  const done=new Promise((resolve,reject)=>{active={id:c.id,expectedTool:c.tool,expectedOutcome:c.outcome,replyPattern:c.reply,called:false,resolve,reject,timer:setTimeout(()=>fail(new Error(`Turn ${c.id} timed out`)),70000)}})
  // Attach a rejection handler before paced upload to prevent unhandled failures.
  done.catch(()=>{})
  for(let i=0;i<pcm.length&&active;i+=4800){send({type:'input_audio_buffer.append',audio:pcm.subarray(i,i+4800).toString('base64')});await delay(100)}
  if(active){send({type:'input_audio_buffer.commit'});send({type:'response.create'})}
  report.steps.push(await done);console.log(`PASS continuous voice ${c.id}`)
 }
 if(browserTransport){
  assert.equal(await page.evaluate(()=>(window as any).__benchEndTransport()),true,'End releases the audio tracks')
  const count=report.steps.length
  await delay(1500)
  assert.equal(report.steps.length,count)
  assert.deepEqual(await rows(),before,'End leaves restored database unchanged')
  await page.evaluate(()=>(window as any).__benchCloseAudio())
  report.steps.push({id:'End-releases-media',status:'passed'})
 }
 assert.equal(report.agentTurns,interrupt?1:2,'Approval/Undo must not start fresh agent turns')
 report.status='passed'
}catch(error){report.status='failed';report.error=(error as Error).message;console.error(report.error);process.exitCode=1}
finally{
 if(page&&browserTransport){report.usage=await page.evaluate(()=>(window as any).__benchProviderUsage??[]).catch(()=>[]);report.finalEvents=await page.evaluate(()=>(window as any).__benchTransportEvents).catch(()=>[]);report.media=await page.evaluate(()=>(window as any).__benchMedia()).catch(()=>null)}
 if(page)for(const id of await page.evaluate(()=>(window as any).__benchCreatedIds??[]).catch(()=>[]))created.add(id)
 if(active)report.lastAction={id:active.id,call:active.call,result:active.result}
 ws?.close();await browser?.close()
 // Even a failed assertion after persistence must clean up only this run's additions.
 try{for(const t of await rows())if(!before.some((b:any)=>b.id===t.id)&&t.user_id===userId&&created.has(t.id)){await rest(`tasks?id=eq.${t.id}&user_id=eq.${userId}`,'DELETE');report.cleanup.push(t.id)}
 assert.deepEqual(await rows(),before,'Final database baseline')
 }catch(error){report.cleanupError=(error as Error).message;report.status='failed';process.exitCode=1}
 writeFileSync(new URL(`./reports/voice-database-${browserTransport?'webrtc-':''}${Date.now()}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n')
}
