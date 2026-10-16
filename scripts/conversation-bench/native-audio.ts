// Actual voice-model tool selection and outcome wording, using production
// instructions/tools. Tool execution is a synthetic fixture, not a database save.
import WebSocket from 'ws'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
import {readPcmWav} from './audio.mjs'
import {workspaceVoiceTools,workspaceVoiceInstructions} from '../../supabase/functions/workspace-voice/handler'
const cases=[
 {id:'capture',clip:'capture.wav',tool:'ask_symphony',terms:['plumber','Amazon','yard','test drive'],fixture:'No card is currently pending.',result:{reply:'Four changes are on the card. Nothing saved yet.',outcome:{state:'proposed',say:'Four changes are proposed. Nothing is saved until approval.'}},reply:/card|propos|approv/i},
 {id:'approve-partial',clip:'approve.wav',tool:'approve_card',terms:[],fixture:'A change card is waiting: Call plumber and Pick up order. No changes saved yet.',result:{reply:'Some changes stayed saved. Check the card before trying again.',outcome:{state:'partial',say:'Some changes stayed saved. Check the card before trying again.'}},reply:/some|part|check/i},
 {id:'undo',clip:'undo.wav',tool:'undo_last_change',terms:[],fixture:'The last saved change has Undo available in the current receipt.',result:{reply:'Undone.',outcome:{state:'saved',say:'Undone.'}},reply:/undone|revert|undo|back/i},
]
async function run(c:typeof cases[number]){
 const pcm=readPcmWav(readFileSync(new URL(`./audio-fixtures/${c.clip}`,import.meta.url)))
 return new Promise<any>((resolve,reject)=>{
  const ws=new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1',{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}})
  let settled=false,streaming=false,called=false,heard='',reply='',earlySpeech='';const calls:any[]=[];const usage:any[]=[]
  const timer=setTimeout(()=>finish(new Error('Native audio replay timeout')),45000)
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);ws.close();if(error)reject(error);else resolve({id:c.id,status:'passed',heard,reply,earlySpeech,calls,usage})}
  const send=(x:any)=>ws.send(JSON.stringify(x))
  ws.on('error',()=>finish(new Error('Voice connection failed')))
  ws.on('close',()=>{if(!settled)finish(new Error('Voice connection closed'))})
  ws.on('open',()=>send({type:'session.update',session:{type:'realtime',model:'gpt-realtime-2.1',instructions:workspaceVoiceInstructions+'\nSynthetic test screen state: '+c.fixture,max_output_tokens:400,tools:workspaceVoiceTools,audio:{input:{format:{type:'audio/pcm',rate:24000},transcription:{model:'gpt-4o-mini-transcribe',language:'en'},noise_reduction:{type:'near_field'},turn_detection:null},output:{voice:'marin',speed:1}}}}))
  ws.on('message',async raw=>{
   try{
    const e=JSON.parse(String(raw))
    if(e.type==='error')return finish(new Error(`Voice API ${e.error?.code??'error'}`))
    if(e.type==='session.updated'&&!streaming){streaming=true;for(let i=0;i<pcm.length&&!settled;i+=4800){send({type:'input_audio_buffer.append',audio:pcm.subarray(i,i+4800).toString('base64')});await delay(100)}if(!settled){send({type:'input_audio_buffer.commit'});send({type:'response.create'})}}
    if(e.type==='conversation.item.input_audio_transcription.completed')heard=e.transcript
    if(e.type==='response.output_audio_transcript.done'){if(called)reply+=e.transcript;else earlySpeech+=e.transcript}
    if(e.type==='response.done'){
     if(e.response?.usage)usage.push(e.response.usage)
     const tools=(e.response?.output??[]).filter((x:any)=>x.type==='function_call')
     if(tools.length){
      if(called)return finish(new Error('Unexpected additional tool call after result'))
      if(tools.length!==1||tools[0].name!==c.tool)return finish(new Error(`Expected ${c.tool}, got ${tools.map((t:any)=>t.name).join(',')}`))
      const call=tools[0],args=JSON.parse(call.arguments??'{}');calls.push({name:call.name,args})
      for(const term of c.terms)if(!String(args.request).toLowerCase().includes(term.toLowerCase()))return finish(new Error(`Lost request term ${term}`))
      if(/\b(saved|done|added)\b/i.test(earlySpeech)&&!/not|nothing|until/i.test(earlySpeech))return finish(new Error('Claimed success before tool result'))
      called=true;send({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(c.result)}});send({type:'response.create'})
     }else if(!called)return finish(new Error('Answered without required tool'))
     else{const text=(e.response?.output??[]).flatMap((o:any)=>o.content??[]).map((x:any)=>x.transcript??x.text??'').join(' ');reply=reply||text;if(!c.reply.test(reply))return finish(new Error('Reply did not convey fixture outcome'));finish()}
    }
   }catch(error){finish(error instanceof Error?error:new Error('Replay error'))}
  })
 })
}
if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY required')
const results=[]
for(const c of cases){try{results.push(await run(c))}catch(error){results.push({id:c.id,status:'failed',error:error instanceof Error?error.message:'unknown'})}console.log(results.at(-1))}
mkdirSync(new URL('./reports/',import.meta.url),{recursive:true})
writeFileSync(new URL('./reports/native-audio.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),model:'gpt-realtime-2.1',scope:'recorded audio + production instructions and tools; synthetic tool results',results},null,2)+'\n')
process.exitCode=results.every(r=>r.status==='passed')?0:1
