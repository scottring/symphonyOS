import {useEffect,useRef,useState} from 'react'
import {supabase} from '@/lib/supabase'
import {voiceFunctionName} from '@/lib/agentStream'
import {RealtimeTransport} from '@/lib/voiceOnboarding/realtimeTransport'
import type {ConversationContext,TransportStatus} from '@/lib/voiceOnboarding/transport'
import {workspaceDestination,type WorkspaceContext} from '@/lib/workspace/context'
import {explainContext} from '@/lib/explain/pageGuides'
import {parseSteps} from '@/lib/explain/steps'
import {requestShow} from '@/lib/explain/showSignal'

/** One connection owned by the shell, shared by its desktop and phone panes.
 *  Tap to talk: Talk opens the mic for the person's turn, Done sends it
 *  (RealtimeTransport `turns: 'tap'`); their words show as they speak. */
export function useWorkspaceVoice(context:WorkspaceContext, ask:(text:string)=>Promise<string|undefined>, navigate:(url:string)=>void, enabled:boolean, accountId:string|null = null) {
 const [status,setStatus]=useState<TransportStatus>('idle'),[error,setError]=useState<string|null>(null),[heard,setHeard]=useState(''),[reply,setReply]=useState('')
 const [turn,setTurn]=useState<'listening'|'off'>('off')
 const transport=useRef<RealtimeTransport|null>(null)
 const current=useRef({context,ask,navigate});current.current={context,ask,navigate}
 const busy=useRef(false)
 const toContext=():ConversationContext=>({step: (['year','season','month','week','today'].includes(current.current.context.page) ? current.current.context.page : 'today') as ConversationContext['step'],focus:current.current.context.page,plan:[JSON.stringify(explainContext(current.current.context))]})
 useEffect(()=>{transport.current?.sync(toContext())},[context])
 useEffect(()=>()=>{transport.current?.stop();transport.current=null},[])
 useEffect(()=>{if(!enabled)transport.current?.stop()},[enabled])
 // Filters can change while talking. Start a fresh voice context rather than
 // leave private prior-layer data in an ongoing spoken conversation.
 const scope=JSON.stringify(context.layers)
 useEffect(()=>{transport.current?.stop()},[scope,accountId])
 const start=async()=>{
  if(!enabled||busy.current)return
  transport.current?.stop();setError(null);setHeard('');setReply('');setTurn('off')
  const voice=new RealtimeTransport({turns:'tap',endpoint:`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${voiceFunctionName()}`,apiKey:import.meta.env.VITE_SUPABASE_ANON_KEY,getAccessToken:async()=>(await supabase.auth.getSession()).data.session?.access_token??null,
   handleTool:async(name,args)=>{
    const data=args as Record<string,unknown>|null
    if(!data||typeof data!=='object')return {error:'Invalid request'}
    if(name==='show_workspace'){
     const url=workspaceDestination(data.page,data.date)
     if(!url)return {error:'Unknown page or date'}
     current.current.navigate(url);return {shown:true,page:data.page}
    }
    if(name==='show_on_page'){
     const steps=parseSteps(data)
     if(!steps.length)return {error:'Nothing to show: use target ids from the screen update'}
     requestShow(steps,'voice');return {shown:steps.length}
    }
    if(name==='ask_symphony'){
     if(typeof data.request!=='string'||!data.request.trim()||data.request.length>5000)return {error:'Invalid request'}
     if(busy.current)return {error:'A save is still running. Wait for it to finish.'}
     busy.current=true
     try{return {reply:await current.current.ask(data.request)??'The request was not processed. Do not claim success.'}}finally{busy.current=false}
    }
    return {error:'Unknown action'}
   }})
  transport.current=voice
  voice.subscribe(event=>{
   if(transport.current!==voice)return
   if(event.type==='status'){setStatus(event.status);if(event.status!=='live')setTurn('off')}
   if(event.type==='turn'){setTurn(event.turn);if(event.turn==='listening')setHeard('')}
   if(event.type==='error')setError(event.message)
   if(event.type==='user')setHeard(event.text)
   if(event.type==='assistant')setReply(event.text)
  })
  await voice.start(toContext())
 }
 const active=['connecting','live','muted'].includes(status)
 return {status,error,heard,reply,active,turn,start,stop:()=>transport.current?.stop(),
  /** Tap mode: the person's turn — opens the mic, and stops Symphony if it is talking. */
  talk:()=>transport.current?.listen(),
  /** Tap mode: Done — send the turn. */
  done:()=>transport.current?.finishTurn(),
  mute:()=>transport.current?.setMuted(status!=='muted'),sendText:(text:string)=>transport.current?.sendText(text)??false}
}
