// Generate once, then ship static clips. Never runs in the browser.
// Usage: node scripts/onboarding-videos/generate-audio.mjs --live
// OPENAI_API_KEY comes from the environment or this checkout's ignored .env.local.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const examples=JSON.parse(fs.readFileSync(path.join(root,'src/lib/onboarding/horizonExamples.json'),'utf8'))
const model='gpt-4o-mini-tts', voice='marin', speed=1
const instructions='Speak in a warm, calm, natural adult voice, like Symphony helping one person understand their own plans. Clear conversational English, normal unhurried pace. Never chirpy, salesy, dramatic, or overemphatic. Read exactly the supplied words. No introduction or closing beyond the script.'
const currentVoice=fs.readFileSync(path.join(root,'supabase/functions/workspace-voice/handler.ts'),'utf8')
if(!currentVoice.includes("output:{voice:'marin',speed:1}")) throw Error('Symphony Talk voice changed. Review the narration voice before regenerating.')
const cache=path.join(root,'node_modules/.cache/symphony-horizon-audio')
fs.mkdirSync(cache,{recursive:true})
const plans=examples.map(example=>({...example,segments:example.narration.map((text,i)=>{
  const hash=crypto.createHash('sha256').update(JSON.stringify({model,voice,speed,instructions,text})).digest('hex').slice(0,16)
  return {text,file:path.join(cache,`${example.id}-${i}-${hash}.wav`)}
})}))
const missing=plans.flatMap(p=>p.segments).filter(s=>!fs.existsSync(s.file))
const estimatedUsd=missing.reduce((n,s)=>n+s.text.length,0)*0.00003 // conservative character-based reserve, not an invoice
if(estimatedUsd>0.2)throw Error('Narration exceeds the bounded $0.20 generation allowance.')
if(!process.argv.includes('--live')) {console.log(JSON.stringify({clips:plans.length,missingSegments:missing.length,estimatedUsd,voice,model}));process.exit(0)}
let apiKey=process.env.OPENAI_API_KEY
if(!apiKey) {
  const env=fs.readFileSync(path.join(root,'.env.local'),'utf8')
  apiKey=env.match(/^OPENAI_API_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g,'')
}
if(!apiKey)throw Error('An existing OpenAI API key is required; never paste it into this script.')
const spendPath=path.join(root,'scripts/conversation-bench/reports/spend.json')
const spend=JSON.parse(fs.readFileSync(spendPath,'utf8'))
if(missing.length && !spend.horizonVideosReservedUsd) {
  spend.horizonVideosReservedUsd=0.2
  spend.estimatedCombinedUsd+=0.2
  spend.horizonVideosReservationBasis='User requested five narrated horizon videos in Symphony’s voice. Reserve $0.20 for one bounded generation under the existing necessary-overrun authorization; static playback makes no model calls.'
  if(spend.estimatedCombinedUsd>spend.authorizedCapUsd) {
    spend.capAdjustments.push({previousCeilingUsd:spend.authorizedCapUsd,newCeilingUsd:15.2,at:new Date().toISOString(),basis:spend.horizonVideosReservationBasis})
    spend.authorizedCapUsd=15.2
  }
  fs.writeFileSync(spendPath,JSON.stringify(spend,null,2)+'\n')
}
// Revisions share the original bounded allowance. Record new audio requests
// before sending them; cached segments never consume a second reservation.
if(missing.length) {
  if(spend.horizonVideosBaselineEstimatedUsd===undefined) {
    const previous=path.join(cache,'plan.json')
    spend.horizonVideosBaselineEstimatedUsd=fs.existsSync(previous)?JSON.parse(fs.readFileSync(previous,'utf8')).estimatedUsd:0
  }
  const requests=spend.horizonVideoAudioRequests??{}
  for(const segment of missing) requests[path.basename(segment.file)]??=Number((segment.text.length*0.00003).toFixed(8))
  const cumulative=Number((spend.horizonVideosBaselineEstimatedUsd+Object.values(requests).reduce((n,value)=>n+value,0)).toFixed(8))
  if(cumulative>spend.horizonVideosReservedUsd)throw Error('Audio revisions would exceed the existing horizon-video reservation.')
  spend.horizonVideoAudioRequests=requests
  spend.horizonVideosEstimatedUsd=cumulative
  fs.writeFileSync(spendPath,JSON.stringify(spend,null,2)+'\n')
}
for(const segment of missing) {
  const response=await fetch('https://api.openai.com/v1/audio/speech',{
    method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,voice,speed,instructions,input:segment.text,response_format:'wav'}),signal:AbortSignal.timeout(60000),
  })
  if(!response.ok)throw Error(`Narration request failed (${response.status}); cached completed clips remain reusable.`)
  const audio=Buffer.from(await response.arrayBuffer())
  if(audio.toString('ascii',0,4)!=='RIFF')throw Error('Narration did not return WAV audio.')
  fs.writeFileSync(segment.file,audio)
  console.log(`Narration ready: ${path.basename(segment.file).split('-').slice(0,2).join(' ')}`)
}
for(const plan of plans) for(const segment of plan.segments) {
  segment.seconds=Number(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',segment.file],{encoding:'utf8'}).trim())
  if(!Number.isFinite(segment.seconds)||segment.seconds<1)throw Error('Invalid audio duration.')
}
fs.writeFileSync(path.join(cache,'plan.json'),JSON.stringify({voice,model,speed,instructions,estimatedUsd,examples:plans},null,2))
console.log(JSON.stringify({status:'ready',voice,model,estimatedUsd,totalNarrationSeconds:plans.flatMap(p=>p.segments).reduce((n,s)=>n+s.seconds,0)}))
