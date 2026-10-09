import {useEffect,useRef,useState} from 'react'
import {supabase} from '@/lib/supabase'
import {RealtimeTransport} from '@/lib/voiceOnboarding/realtimeTransport'
import type {ConversationContext,TransportStatus} from '@/lib/voiceOnboarding/transport'
import {workspaceDestination,type WorkspaceContext} from '@/lib/workspace/context'

/** One connection owned by the shell, shared by its desktop and phone panes. */
export function useWorkspaceVoice(context:WorkspaceContext, ask:(text:string)=>Promise<string|undefined>, navigate:(url:string)=>void, enabled:boolean, accountId:string|null = null) {
 const [status,setStatus]=useState<TransportStatus>('idle'),[error,setError]=useState<string|null>(null),[heard,setHeard]=useState(''),[reply,setReply]=useState('')
 const transport=useRef<RealtimeTransport|null>(null)
 const current=useRef({context,ask,navigate});current.current={context,ask,navigate}
 const busy=useRef(false)
 const toContext=():ConversationContext=>({step: (['year','season','month','week','today'].includes(current.current.context.page) ? current.current.context.page : 'today') as ConversationContext['step'],focus:current.current.context.page,plan:[JSON.stringify(current.current.context)]})
 useEffect(()=>{transport.current?.sync(toContext())},[context])
 useEffect(()=>()=>{transport.current?.stop();transport.current=null},[])
 useEffect(()=>{if(!enabled)transport.current?.stop()},[enabled])
 // Filters can change while talking. Start a fresh voice context rather than
 // leave private prior-layer data in an ongoing spoken conversation.
 const scope=JSON.stringify(context.layers)
 useEffect(()=>{transport.current?.stop()},[scope,accountId])
 const start=async()=>{
  if(!enabled||busy.current)return
  transport.current?.stop();setError(null);setHeard('');setReply('')
  const voice=new RealtimeTransport({endpoint:`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workspace-voice`,apiKey:import.meta.env.VITE_SUPABASE_ANON_KEY,getAccessToken:async()=>(await supabase.auth.getSession()).data.session?.access_token??null,
   handleTool:async(name,args)=>{
    const data=args as Record<string,unknown>|null
    if(!data||typeof data!=='object')return {error:'Invalid request'}
    if(name==='show_workspace'){
     const url=workspaceDestination(data.page,data.date)
     if(!url)return {error:'Unknown page or date'}
     current.current.navigate(url);return {shown:true,page:data.page}
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
   if(event.type==='status')setStatus(event.status)
   if(event.type==='error')setError(event.message)
   if(event.type==='user')setHeard(event.text)
   if(event.type==='assistant')setReply(event.text)
  })
  await voice.start(toContext())
 }
 const active=['connecting','live','muted'].includes(status)
 return {status,error,heard,reply,active,start,stop:()=>transport.current?.stop(),mute:()=>transport.current?.setMuted(status!=='muted'),sendText:(text:string)=>transport.current?.sendText(text)??false}
}
