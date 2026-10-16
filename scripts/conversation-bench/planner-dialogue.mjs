// Replay a complete planning dialogue against the restricted synthetic candidate.
// Read-only database verification; no approval or persistence calls in this runner.
import fs from 'node:fs'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
const root=process.env.BENCH_ENV_DIR
assert.ok(root,'BENCH_ENV_DIR must identify the existing synthetic configuration')
const env=p=>Object.fromEntries(fs.readFileSync(p,'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'')]))
const cfg=env(resolve(root,'.env.production')),account=env(resolve(root,'.env.bench'))
assert.match(account.BENCH_A1_EMAIL,/\+|synthetic/i)
const spec=JSON.parse(fs.readFileSync(new URL('./dialogues/beta-week-shower-bike-bench.json',import.meta.url)))
const spendPath=new URL('./reports/spend.json',import.meta.url),spend=JSON.parse(fs.readFileSync(spendPath))
assert.ok(spend.estimatedCombinedUsd+.25<=spend.authorizedCapUsd,'Insufficient remaining budget')
const signIn=await fetch(cfg.VITE_SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:cfg.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:account.BENCH_A1_EMAIL,password:account.BENCH_A1_PASSWORD})})
assert.ok(signIn.ok,`Synthetic sign-in ${signIn.status}`)
const session=await signIn.json(),headers={apikey:cfg.VITE_SUPABASE_ANON_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'}
const rows=async()=>{const r=await fetch(cfg.VITE_SUPABASE_URL+'/rest/v1/tasks?select=*&order=id',{headers,signal:AbortSignal.timeout(15000)});assert.ok(r.ok);return r.json()}
const baseline=await rows();assert.ok(baseline.length<1000)
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const nextDay=new Date(today+'T12:00:00Z');nextDay.setUTCDate(nextDay.getUTCDate()+1);const tomorrow=nextDay.toISOString().slice(0,10)
const report={at:new Date().toISOString(),spec:spec.id,endpoint:'symphony-conversation-bench',status:'running',steps:[]}
const messages=[];let card
// Reserve before provider work, even if the process is interrupted.
spend.estimatedCombinedUsd+=.25;spend.dialogueReservedUsd=(spend.dialogueReservedUsd??0)+.25
fs.writeFileSync(spendPath,JSON.stringify(spend,null,2)+'\n')
try{
 for(const text of spec.messages){
  messages.push({role:'user',content:text})
  const r=await fetch(cfg.VITE_SUPABASE_URL+'/functions/v1/symphony-conversation-bench',{method:'POST',headers,signal:AbortSignal.timeout(60000),body:JSON.stringify({messages,turnId:crypto.randomUUID(),workspaceContext:{page:'week',date:today,layers:['family'],items:[],truncated:true},...(card?{changeCard:{state:'pending',title:card.title,ops:card.ops.map(o=>({op:o.op,title:o.title,taskId:o.taskId,date:o.date,time:o.time,where:o.date??''})),at:new Date().toISOString()}}:{})})})
  assert.ok(r.ok,`Candidate ${r.status}`)
  const events=(await r.text()).split('\n\n').filter(s=>s.startsWith('data: ')).map(s=>JSON.parse(s.slice(6)))
  const done=events.find(e=>e.type==='done'),error=events.find(e=>e.type==='error'),next=events.filter(e=>e.type==='change_set').at(-1)?.set
  report.steps.push({request:text,reply:done?.reply,outcome:done?.outcome,card:next,error:error?.message,tools:events.filter(e=>e.type==='tool').map(e=>e.name)})
  assert.ok(done,error?.message??'Missing completion');assert.ok(done.reply.trim(),'Reply required')
  assert.doesNotMatch(done.reply,/Something went wrong|Jerry Salve|Rita/i)
  assert.deepEqual(await rows(),baseline,'No changes before approval')
  if(next)card=next
  messages.push({role:'assistant',content:done.reply})
  console.log('PASS dialogue:',text)
 }
 assert.equal(card?.ops.length,3)
 assert.ok(card.ops.some(o=>/shower/i.test(o.title)&&o.date===today&&o.time==='16:00'),'Shower time preserved')
 assert.ok(card.ops.some(o=>/bicycle|bike/i.test(o.title)&&o.date===tomorrow),'Bicycle tomorrow')
 assert.ok(card.ops.some(o=>/white bench/i.test(o.title)&&!o.date),'Bench remains undated')
 assert.ok(!card.ops.some(o=>/gate latch/i.test(o.title)),'No redundant gate-latch move')
 report.status='passed'
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error(e.message)}
finally{
 try{assert.deepEqual(await rows(),baseline,'Final database unchanged');report.databaseUnchanged=true}catch(e){report.status='failed';report.databaseUnchanged=false;report.error=e.message;process.exitCode=1}
 fs.writeFileSync(new URL('./reports/planner-dialogue-'+Date.now()+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
}
