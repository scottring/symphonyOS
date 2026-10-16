// Real validators, activity provider, approval UI and applier; synthetic writers only.
import React, { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { CanvasActivityProvider, useCanvasActivity } from '../../src/contexts/CanvasActivityContext'
import { RealtimeTransport } from '../../src/lib/voiceOnboarding/realtimeTransport'
import { createWorkspaceVoiceToolHandler } from '../../src/hooks/useWorkspaceVoice'
import { ConversationStrip } from '../../src/components/canvas/ConversationStrip'
import { applyChangeSet } from '../../src/lib/canvas/applyChangeSet'
import { changeSetFromInput, resolveRefs } from '../../supabase/functions/symphony-agent/changeSet'
import { Store, ymd } from './store'
import cases from './ui-journeys.json'
import '../../src/index.css'
import '../../src/styles/canvas.css'
// Browser integration seam: synthetic audio replaces only the physical mic.
// SDP exchange and event handling use the actual production transport/handler.
let peer: RTCPeerConnection
let audioContext: AudioContext, input: MediaStreamAudioDestinationNode, transport: RealtimeTransport
;(window as any).__benchStartTransport = async () => {
  audioContext = new AudioContext({sampleRate:24000})
  await audioContext.resume()
  input = audioContext.createMediaStreamDestination()
  // Keep sending real silent frames between clips, like an open physical mic.
  // An otherwise inactive Web Audio graph can stop frames, preventing server VAD
  // from ever observing the end of a sentence.
  const silence=audioContext.createConstantSource();silence.offset.value=0;silence.connect(input);silence.start()
  ;(window as any).__benchTransportEvents = []
  ;(window as any).__benchProviderUsage = []
  transport = new RealtimeTransport({turns:'tap',explicitSend:true,endpoint:'/bench-voice-offer',getAccessToken:async()=> 'synthetic',
    getUserMedia:async()=>input.stream,
    createPeer:()=>{
      peer=new RTCPeerConnection()
      const create=peer.createDataChannel.bind(peer)
      peer.createDataChannel=(label,options)=>{
        const channel=create(label,options)
        channel.addEventListener('message',message=>{const e=JSON.parse(message.data);if(e.type==='response.done'&&e.response?.usage)(window as any).__benchProviderUsage.push(e.response.usage)})
        return channel
      }
      return peer
    },
    fetch:async (_url,init)=>{
      const r=await (window as any).__benchOffer(String(init?.body))
      return new Response(r.body,{status:r.status,headers:r.headers})
    },
    handleTurn:async text=>{const result=await (window as any).__benchTool('ask_symphony',{request:text});return result.reply??result.error??'The request could not be confirmed.'},
    handleTool:(name,args)=>(window as any).__benchTool(name,args),
  })
  transport.subscribe(e=>(window as any).__benchTransportEvents.push(e))
  await transport.start({step:'week',plan:[]})
}
;(window as any).__benchPlayAudio = async (wav: number[]) => {
 const buffer=await audioContext.decodeAudioData(new Uint8Array(wav).buffer)
 const source=audioContext.createBufferSource();source.buffer=buffer;source.connect(input)
 await new Promise<void>(resolve=>{source.onended=()=>{source.disconnect();resolve()};source.start()})
}
;(window as any).__benchDone = () => transport.finishTurn()
;(window as any).__benchEndTransport = () => {transport.stop();return input.stream.getTracks().every(t=>t.readyState==='ended')}
;(window as any).__benchMedia = async () => ({context:audioContext.state,tracks:input.stream.getTracks().map(t=>({enabled:t.enabled,state:t.readyState})),connection:peer.connectionState,stats:[...(await peer.getStats()).values()].filter(s=>['outbound-rtp','media-source'].includes(s.type)).map(s=>({type:s.type,kind:s.kind,bytesSent:s.bytesSent,totalAudioEnergy:s.totalAudioEnergy,audioLevel:s.audioLevel}))})
;(window as any).__benchCloseAudio = () => audioContext.close()
const live = (window as any).__benchLive
;(window as any).__benchCreatedIds = []
const scenario = live?.scenario ?? cases.find(c => c.id === new URLSearchParams(location.search).get('case')) ?? cases[0]
const store = new Store(scenario.start.tasks, scenario.start.routines)
function observe() {
  return { tasks: [...store.tasks.values()].map(t => ({ id:t.id,title:t.title,date:ymd(t.scheduledFor) ?? null,completed:t.completed,bucket:t.bucket,assignedTo:t.assignedTo ?? null })), routines: [...store.routines.values()].map(r => ({id:r.id,name:r.name,days:r.recurrence_pattern.days,time:r.time_of_day})), skipped:[...store.skipped].map(id=>({id})), occurrences:[...store.occurrences.values()] }
}
function Panel({ refresh }: { refresh: () => void }) {
  const a = useCanvasActivity()
  const [stage, setStage] = useState(0)
  const busy = useRef(false)
  useEffect(() => {
    if (!live?.voice) return
    const current = {current: {
      navigate: () => { throw new Error('Unexpected navigation in transaction fixture') },
      ask: async (request: string) => {
        const result = await (window as any).__benchAsk(request)
        if (result.card) a.setChangeSet(result.card)
        return {text:result.reply,outcome:result.outcome}
      },
      approveCard: async () => {
        if (!a.changeSet) return 'none' as const
        let outcome: 'saved'|'partial'|'failed' = 'failed'
        await a.approveChangeSet(state => {outcome=state})
        return outcome
      },
      undoChange: () => a.undo(),
    }}
    ;(window as any).__benchVoice = createWorkspaceVoiceToolHandler(current,busy,()=>{})
    return () => { delete (window as any).__benchVoice }
  },[a])

  const propose = () => {
    if (live?.cards) { a.setChangeSet(live.cards[stage]); setStage(stage+1); return }
    const parsed = changeSetFromInput(scenario.stages[stage], `${scenario.id}:${stage}`)
    if ('error' in parsed) throw new Error(parsed.error)
    const resolved = resolveRefs(parsed.set, store.serverRows(), scenario.start.members, store.serverRoutines())
    if ('error' in resolved) throw new Error(resolved.error)
    a.setChangeSet(resolved.set); setStage(stage+1)
  }
  return <><h1>{scenario.id} · synthetic records</h1><button disabled={stage>=scenario.stages.length} onClick={propose}>Stage proposal</button>
    {scenario.fault==='stale' && <button onClick={() => {const t=[...store.tasks.values()][0];store.tasks.set(t.id,{...t,scheduledFor:new Date('2026-10-18T12:00:00'),updatedAt:new Date()});refresh()}}>Simulate another edit</button>}
    <output data-testid="records">{JSON.stringify(observe())}</output><output data-testid="receipt">{a.receipt?.state ?? 'none'}</output>
    <div style={{height:'70vh',width:420}}><ConversationStrip chatOnly={!live?.voice} panel messages={[]} busy={false} onSend={()=>{}} voice={{available:false,active:false,status:'idle',start:()=>{},stop:()=>{}}} /></div></>
}
function App() {
  const [,update] = useState(0);const refresh = () => update(n=>n+1)
  return <CanvasActivityProvider persistKey={`bench-${scenario.id}`} snapshot={{tasks:[...store.tasks.values()],goals:[]}} refetch={refresh} writers={{deleteTask:async()=>{},updateTask:async()=>{},deleteGoal:async()=>{},updateGoal:async()=>{}}} applyChanges={async set => {
    const deps = store.deps(new Date('2026-10-11T12:00:00'))
    if (live) {
      const rest = async (path: string, method: string, body?: unknown) => {
        const response = await fetch(`${live.url}/rest/v1/${path}`, {method, headers:{apikey:live.anon,Authorization:`Bearer ${live.token}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body ? JSON.stringify(body):undefined})
        if(!response.ok)throw new Error(`Synthetic writer ${response.status}`)
        return response.json()
      }
      deps.addTask = async(title,when,options) => {
        const id=crypto.randomUUID();(window as any).__benchCreatedIds.push(id)
        const rows=await rest('tasks','POST',{id,user_id:live.userId,title,context:'family',scope:'compound',bucket:when?'timed':'week',scheduled_for:when?.toISOString()??null,is_all_day:options?.isAllDay??false})
        const row=rows[0];store.tasks.set(row.id,{id:row.id,title:row.title,completed:row.completed,createdAt:new Date(row.created_at),updatedAt:new Date(row.updated_at),bucket:row.bucket,scheduledFor:row.scheduled_for?new Date(row.scheduled_for):undefined} as any)
        return row.id
      }
      deps.deleteTask = async id => {await rest(`tasks?id=eq.${id}`,'DELETE');store.tasks.delete(id)}
    }
    const realUpdate = deps.updateTask; let writes=0
    deps.updateTask = async (id, values) => {writes++; if ((scenario.fault==='rollback'||scenario.fault==='partial') && (writes===2 || scenario.fault==='partial'&&writes===3)) return false; return realUpdate(id,values)}
    const result=await applyChangeSet(set,deps);refresh()
    if(result.ok){const undo=result.undo;result.undo=async()=>{const ok=await undo();refresh();return ok}}
    return result
  }}><Panel refresh={refresh}/></CanvasActivityProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
