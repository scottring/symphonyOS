import {proxyHeaders} from './proxy-headers'
// Local-only candidate app connected to the existing synthetic household.
// Secrets and bootstrap session remain server-side/in-memory, never in source.
import {createServer} from 'vite'
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {handleWorkspaceVoice} from '../../supabase/functions/workspace-voice/handler'
const env=(p:string)=>Object.fromEntries(readFileSync(p,'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^['"]|['"]$/g,'')]))
const chatOnly=process.env.BENCH_CHAT_ONLY==='1'
const root=process.env.BENCH_ENV_DIR;if(!root||(!chatOnly&&!process.env.OPENAI_API_KEY))throw new Error('Existing test configuration required')
const cfg=env(resolve(root,'.env.production')),account=env(process.env.BENCH_ACCOUNTS_PATH??resolve(root,'.env.bench'))
if(!/\+|synthetic/i.test(account.BENCH_A1_EMAIL))throw new Error('Dedicated synthetic account required')
const port=Number(process.env.BENCH_PORT??5190),onboarding=process.env.BENCH_ONBOARDING==='1'
const host=process.env.BENCH_HOST??'127.0.0.1'
if(!['127.0.0.1','localhost'].includes(host))throw new Error('Loopback preview host required')
const remote=cfg.VITE_SUPABASE_URL,key=cfg.VITE_SUPABASE_ANON_KEY,origin=`http://${host}:${port}`
const r=await fetch(`${remote}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:account.BENCH_A1_EMAIL,password:account.BENCH_A1_PASSWORD})})
if(!r.ok)throw new Error(`Test sign-in failed (${r.status})`)
let session:any=await r.json();const userId=session.user.id,bootstrap=crypto.randomUUID()
const spendPath=new URL('./reports/spend.json',import.meta.url)
const maxChatTurns=20;let chatTurns=0
async function identify(auth:string){const r=await fetch(`${remote}/auth/v1/user`,{headers:{apikey:key,Authorization:auth},signal:AbortSignal.timeout(10000)});if(!r.ok)return null;const u=await r.json();return u.id===userId?userId:null}
const server=await createServer({mode:'production',define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(origin),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify(key)},server:{host,port,strictPort:true},plugins:[{
 name:'synthetic-manual-candidate',
 configureServer(server){server.middlewares.use(async(req,res,next)=>{
  const path=req.url??'/'
  if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end('Local candidate only');return}
  if(path===`/__bench-login/${bootstrap}`&&session){
   const tokens=JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token});session=null
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Referrer-Policy':'no-referrer'})
   res.end(`<p>Opening the synthetic test household…</p><script type="module">import {supabase} from '/src/lib/supabase.ts';const {error}=await supabase.auth.setSession(${tokens});if(error)document.body.textContent='Test sign-in failed';else {localStorage.setItem('symphony-scratchpad-hidden','0');location.replace('${onboarding?'/getting-started':'/week?view=alongside'}');}</script>`);return
  }
  if(!/^\/(auth|rest|functions|storage)\/v1\//.test(path))return next()
  try{
   const auth=String(req.headers.authorization??'')
   // Auth refresh is allowed only for the authenticated synthetic session; the
   // preview has no password/login proxy or alternate-account sign-in endpoint.
   if(path.startsWith('/auth/v1/token')&& !path.includes('grant_type=refresh_token')){res.writeHead(403);res.end('Use the prepared test session');return}
   if(!path.startsWith('/auth/v1/token')&&!await identify(auth)){res.writeHead(403);res.end('Synthetic test account only');return}
   const chunks:Buffer[]=[];for await(const chunk of req){chunks.push(Buffer.from(chunk));if(chunks.reduce((n,b)=>n+b.length,0)>2e6)throw new Error('Request too large')}
   const body=Buffer.concat(chunks)
   if(path==='/functions/v1/workspace-voice'){
    if(chatOnly){res.writeHead(403);res.end('Talk is paused for this chat walkthrough');return}
    const response=await handleWorkspaceVoice(new Request(origin+path,{method:req.method,headers:{Authorization:auth,'Content-Type':String(req.headers['content-type']??'')},...(body.length?{body}: {})}),{
     env:name=>({WORKSPACE_VOICE_ENABLED:'1',WORKSPACE_VOICE_USER_IDS:userId,OPENAI_API_KEY:process.env.OPENAI_API_KEY} as any)[name],
     userId:identify,
     reserve:async()=>{const spend=JSON.parse(readFileSync(spendPath,'utf8'));if(spend.estimatedCombinedUsd+2.5>spend.authorizedCapUsd)return false;spend.estimatedCombinedUsd+=2.5;spend.manualPreviewReservedUsd=(spend.manualPreviewReservedUsd??0)+2.5;writeFileSync(spendPath,JSON.stringify(spend,null,2)+'\n');return true},
     vocabulary:async()=>{const r=await fetch(`${remote}/rest/v1/family_members?select=name&limit=20`,{headers:{apikey:key,Authorization:auth}});return r.ok?(await r.json()).map((m:any)=>m.name):[]},fetch,
    })
    const h=Object.fromEntries(response.headers);h['x-voice-max-seconds']='300';res.writeHead(response.status,h);res.end(await response.text());return
   }
   if(chatOnly&&path==='/functions/v1/symphony-agent'&&req.method==='POST'){
    if(chatTurns>=maxChatTurns){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'This walkthrough has reached its 20-message limit. The conversation is preserved.'}));return}
    chatTurns++
   }
   const upstreamPath=process.env.BENCH_AGENT_FUNCTION==='symphony-conversation-bench'&&path==='/functions/v1/symphony-agent'?'/functions/v1/symphony-conversation-bench':path
   const response=await fetch(remote+upstreamPath,{method:req.method,headers:proxyHeaders(req.headers,key),...(body.length?{body}:{}),signal:AbortSignal.timeout(60000)})
   res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')??'application/json','Cache-Control':'no-store',...(response.headers.get('content-range')?{'Content-Range':response.headers.get('content-range')!}:{})});res.end(Buffer.from(await response.arrayBuffer()))
  }catch{res.writeHead(502,{'Content-Type':'text/plain'});res.end('Local test connection unavailable')}
 })},
 transformIndexHtml(html){return html.replace('</body>',`<div style="position:fixed;top:0;left:0;right:0;z-index:99999;text-align:center;background:#fff3c4;color:#473700;font:12px system-ui;padding:4px;pointer-events:none">${onboarding?'Onboarding walkthrough · synthetic household only':chatOnly?'Chat walkthrough · real AI · synthetic test household':'Local candidate · synthetic test household · voice sessions up to 5 minutes'}</div></body>`)},
}]})
await server.listen()
writeFileSync(process.env.BENCH_BOOTSTRAP_FILE??(onboarding?'/tmp/symphony-onboarding-preview-url':'/tmp/symphony-manual-preview-url'),`${origin}/__bench-login/${bootstrap}`,{mode:0o600})
console.log(`Manual candidate ready at ${origin} (one-time test sign-in link prepared)`)
