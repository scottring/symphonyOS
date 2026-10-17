// Two bounded live proposal turns, actual browser approval/applier, dedicated
// synthetic-account REST persistence/readback and Undo. Never uses service-role access.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {gradeTurn} from './grading.mjs'
const readEnv=p=>Object.fromEntries(readFileSync(p,'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'')]))
const dir=process.env.BENCH_ENV_DIR;if(!dir)throw new Error('BENCH_ENV_DIR must point to the existing synthetic account configuration')
const config=readEnv(resolve(dir,'.env.production')),bench=readEnv(resolve(dir,'.env.bench'))
if(!/\+|synthetic/.test(bench.BENCH_A1_EMAIL??''))throw new Error('Synthetic account required')
const url=config.VITE_SUPABASE_URL,anon=config.VITE_SUPABASE_ANON_KEY
const login=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:bench.BENCH_A1_EMAIL,password:bench.BENCH_A1_PASSWORD})})
if(!login.ok)throw new Error(`Synthetic sign-in ${login.status}`)
const session=await login.json(),token=session.access_token,userId=session.user.id
const headers={apikey:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json'}
const rest=async(path,method='GET')=>{const r=await fetch(`${url}/rest/v1/${path}`,{method,headers});if(!r.ok)throw new Error(`Read/cleanup ${r.status}`);return method==='DELETE'?null:r.json()}
const nonce=crypto.randomUUID().slice(0,8),titles=[`Bench ${nonce} plumber call`,`Bench ${nonce} collect order`]
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const future=new Date(`${today}T12:00:00Z`);future.setUTCDate(future.getUTCDate()+1);const tomorrow=future.toISOString().slice(0,10)
const report={at:new Date().toISOString(),kind:'live proposal + real approval UI/applier + synthetic database + Undo',steps:[],cleanup:[]}
const before=await rest('tasks?select=*');assert.ok(before.length<1000,'Complete baseline required')
let browser
try {
 const messages=[],cards=[]
 const asks=[`Propose exactly two new tasks on one change card: "${titles[0]}" and "${titles[1]}". Leave both undated this week. Do not save anything; wait for my approval.`, `Correct that same pending card: put "${titles[0]}" on ${tomorrow}, all day. Keep "${titles[1]}" undated. Still exactly two tasks. Do not save yet.`]
 for(const [i,request] of asks.entries()){
  messages.push({role:'user',content:request})
  const response=await fetch(`${url}/functions/v1/symphony-agent`,{method:'POST',headers,body:JSON.stringify({messages,turnId:crypto.randomUUID(),workspaceContext:{page:'week',date:today,layers:['family'],items:[],truncated:true},...(cards.length?{changeCard:{state:'pending',title:cards.at(-1).title,ops:cards.at(-1).ops.map(o=>({op:o.op,title:o.title,where:o.date??''})),at:new Date().toISOString()}}:{})})})
  if(!response.ok)throw new Error(`Agent ${response.status}`)
  const events=(await response.text()).split('\n\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)))
  const done=events.find(e=>e.type==='done')??events.find(e=>e.type==='error'),card=events.filter(e=>e.type==='change_set').at(-1)?.set
  const got={tools:events.filter(e=>e.type==='tool').map(e=>e.name),outcome:done?.outcome,reply:done?.reply??'',error:done?.type==='error'?done.message:null,changeSet:card}
  const findings=gradeTurn({expect:{outcome:['proposed'],card:{ops:2,contains:titles.map((title,n)=>({op:'add',title,...(i===1&&n===0?{date:tomorrow}:{})}))}}},got)
  assert.deepEqual(findings,[],`live proposal ${i+1}`)
  assert.ok(card.ops.every(o=>o.op==='add'),'Only new records authorized for this fixture')
  assert.deepEqual(await rest('tasks?select=*'),before,'Proposal must not persist records')
  cards.push(card);messages.push({role:'assistant',content:got.reply});report.steps.push({name:`proposal-${i+1}`,status:'passed',card})
  console.log(`PASS live proposal ${i+1}`)
 }
 browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage({timezoneId:'America/New_York'});page.setDefaultTimeout(10000)
 await page.addInitScript(config=>{window.__benchLive=config},{url,anon,token,userId,cards,scenario:{id:'live-capture-correction',start:{tasks:[],routines:[],members:[]},stages:cards.map(c=>({title:c.title,ops:[]}))}})
 await page.goto(`${process.env.BENCH_PREVIEW_URL??'http://127.0.0.1:5183'}/scripts/conversation-bench/transaction-preview.html`)
 for(const card of cards){await page.getByRole('button',{name:'Stage proposal',exact:true}).click();await page.getByRole('button',{name:'Approve all 2'}).waitFor()}
 await page.getByRole('button',{name:'Approve all 2'}).click();await page.getByRole('button',{name:'Undo',exact:true}).waitFor()
 const saved=await rest('tasks?select=*');const added=saved.filter(t=>!before.some(b=>b.id===t.id))
 assert.equal(added.length,2);assert.deepEqual(added.map(t=>t.title).sort(),[...titles].sort());assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(added.find(t=>t.title===titles[0]).scheduled_for)),tomorrow)
 assert.deepEqual(saved.filter(t=>before.some(b=>b.id===t.id)),before,'Bystanders unchanged')
 report.steps.push({name:'approve-and-persist',status:'passed',created:added.map(t=>t.id)})
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByText('Undone',{exact:true}).waitFor()
 assert.deepEqual(await rest('tasks?select=*'),before,'Undo must restore baseline')
 report.steps.push({name:'undo-and-readback',status:'passed'});console.log('PASS persisted approval, date, bystanders and Undo')
}catch(error){report.steps.push({name:'journey',status:'failed',error:error.message});console.error(error.message);process.exitCode=1}
finally{
 await browser?.close()
 for(const t of await rest('tasks?select=id,title,user_id'))if(t.user_id===userId&&titles.includes(t.title)&&!before.some(b=>b.id===t.id)){await rest(`tasks?id=eq.${t.id}`,'DELETE');report.cleanup.push(t.id)}
 mkdirSync(new URL('./reports/',import.meta.url),{recursive:true});writeFileSync(new URL(`./reports/live-approval-${Date.now()}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n')
}
