import {isConversationApproval} from '@/lib/conversationActions'
import {useEffect,useRef,useState} from 'react'
import {supabase} from '@/lib/supabase'
import {voiceFunctionName} from '@/lib/agentStream'
import {RealtimeTransport} from '@/lib/voiceOnboarding/realtimeTransport'
import type {ConversationContext,TransportStatus} from '@/lib/voiceOnboarding/transport'
import {workspaceDestination,type WorkspaceContext} from '@/lib/workspace/context'
import {explainContext} from '@/lib/explain/pageGuides'
import {parseSteps} from '@/lib/explain/steps'
import {requestShow} from '@/lib/explain/showSignal'
import type {TurnOutcome} from '@/lib/turnOutcome'

/** What the shell's ask returns: the reply alone (older callers) or the reply with the server's verdict. */
export type AskResult=string|{text:string;outcome?:TurnOutcome}|undefined

/** One connection owned by the shell, shared by its desktop and phone panes.
 *  Tap to talk: Talk opens the mic for the person's turn, Done sends it
 *  (RealtimeTransport `turns: 'tap'`); their words show as they speak. */
export type ApproveCard=()=>Promise<'saved'|'none'|'failed'|'partial'>
export type UndoChange=()=>Promise<'undone'|'none'|'failed'>
const UNDO=/^\s*undo(?: (?:that|it|the last change))?[.!]*\s*$/i

export function useWorkspaceVoice(context:WorkspaceContext, ask:(text:string)=>Promise<AskResult>, navigate:(url:string)=>void, enabled:boolean, accountId:string|null = null, approveCard?:ApproveCard, undoChange?:UndoChange) {
 const [status,setStatus]=useState<TransportStatus>('idle'),[error,setError]=useState<string|null>(null),[heard,setHeard]=useState(''),[reply,setReply]=useState('')
 const [turn,setTurn]=useState<'listening'|'off'>('off')
 // What is happening right now, for the bar to show (Scott, 2026-10-15:
 // "nothing visual happens to show what is occurring").
 const [speaking,setSpeaking]=useState<'you'|'symphony'|null>(null),[working,setWorking]=useState(false)
 const transport=useRef<RealtimeTransport|null>(null)
 const current=useRef({context,ask,navigate,approveCard,undoChange});current.current={context,ask,navigate,approveCard,undoChange}
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
  const voice=new RealtimeTransport({turns:'tap',explicitSend:true,endpoint:`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${voiceFunctionName()}`,apiKey:import.meta.env.VITE_SUPABASE_ANON_KEY,getAccessToken:async()=>(await supabase.auth.getSession()).data.session?.access_token??null,
   handleTurn:async text=>{
    setWorking(true)
    try { const result=await current.current.ask(text); return typeof result==='string'?result:result?.text??'Another turn is still running. Please wait.' }
    finally {setWorking(false)}
   },
   handleTool:createWorkspaceVoiceToolHandler(current,busy,setWorking)})
  transport.current=voice
  voice.subscribe(event=>{
   if(transport.current!==voice)return
   if(event.type==='status'){
    setStatus(event.status);if(event.status!=='live')setTurn('off')
    if(event.reason==='time_limit')setError('Voice reached its session limit. Your conversation is still here. Check whether your last message appears above; if it does not, type it or start voice again.')
   }
   if(event.type==='turn')setTurn(event.turn)
   // The heard line stays until the person speaks again: the mic now re-opens
   // by itself after each answer, and clearing then hid what was heard (2026-10-15).
   if(event.type==='speaking'){setSpeaking(event.active?(event.who==='user'?'you':'symphony'):null);if(event.who==='user'&&event.active)setHeard('')}
   if(event.type==='status'&&event.status!=='live'){setSpeaking(null);setWorking(false)}
   if(event.type==='error')setError(event.message)
   if(event.type==='user')setHeard(event.text)
   if(event.type==='assistant')setReply(event.text)
   // Content-free timing for the UX05 targets; read it from the console on a real device.
   if(event.type==='metric')console.info('symphony.voice.metric',JSON.stringify({name:event.name,ms:event.ms,page:current.current.context.page}))
  })
  await voice.start(toContext())
 }
 const active=['connecting','live','muted'].includes(status)
 return {status,error,heard,reply,active,turn,speaking,working,start,stop:()=>transport.current?.stop(),
  /** Tap mode: the person's turn — opens the mic, and stops Symphony if it is talking. */
  talk:()=>transport.current?.listen(),
  /** Tap mode: Done — send the turn. */
  done:()=>transport.current?.finishTurn(),
  mute:()=>transport.current?.setMuted(status!=='muted'),sendText:(text:string)=>transport.current?.sendText(text)??false}
}

/** Shared by the live transport and recorded-audio integration tests. */
export function createWorkspaceVoiceToolHandler(
 current: {current: {ask:(text:string)=>Promise<AskResult>; navigate:(url:string)=>void; approveCard?:ApproveCard; undoChange?:UndoChange}},
 busy: {current:boolean}, setWorking:(working:boolean)=>void,
) {
 return async(name:string,args:unknown) => {
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
    // Spoken approve saves the card on screen (Session D, 2026-10-15: "Approve"
    // was forwarded as text and answered "needs your approval in the app").
    const approve=async()=>{
     if(busy.current)return {error:'A save is still running. Wait for it to finish.'}
     const fn=current.current.approveCard
     if(!fn)return null
     busy.current=true;setWorking(true)
     try {
      const got=await fn()
      if(got==='none')return null
      if(got==='partial')return {reply:'Only part was saved. Check the card before trying again.',outcome:{state:'partial',say:'Some changes stayed saved. Check the card before trying again.'}}
      return got==='saved'?{reply:'Saved.',outcome:{state:'saved',say:'Saved.'}}:{reply:"Couldn't save it.",outcome:{state:'failed',say:'Not saved. The card on screen says why.'}}
     } catch { return {reply:'The save could not be confirmed. Check the card.',outcome:{state:'unverified',say:'The save could not be confirmed. Check the card.'}} }
     finally {busy.current=false;setWorking(false)}
    }
    const undo=async()=>{
     if(busy.current)return {error:'A save is still running. Wait for it to finish.'}
     busy.current=true;setWorking(true)
     try{
      const got=await current.current.undoChange?.()??'none'
      if(got==='none')return {reply:'There is no change to undo.',outcome:{state:'answered',say:'There is no change to undo.'}}
      if(got==='failed')return {reply:'Could not undo all of it. Check the page.',outcome:{state:'unverified',say:'Could not confirm a complete Undo. Check the page.'}}
      return {reply:'Undone.',outcome:{state:'saved',say:'Undone.'}}
     }catch{return {reply:'Could not confirm Undo. Check the page.',outcome:{state:'unverified',say:'Could not confirm Undo. Check the page.'}}}
     finally{busy.current=false;setWorking(false)}
    }
    if(name==='undo_last_change')return undo()
    if(name==='approve_card'){
     return (await approve())??{reply:'No card is waiting.',outcome:{state:'answered',say:'There is no card to approve right now.'}}
    }
    if(name==='ask_symphony'){
     if(typeof data.request!=='string'||!data.request.trim()||data.request.length>5000)return {error:'Invalid request'}
     if(UNDO.test(data.request))return undo()
     if(isConversationApproval(data.request)){const r=await approve();if(r)return r}
     if(busy.current)return {error:'A save is still running. Wait for it to finish.'}
     busy.current=true;setWorking(true)
     try{
      const got=await current.current.ask(data.request)
      if(got===undefined)return {reply:'The request was not processed. Do not claim success.',outcome:{state:'failed',say:'Nothing saved.'}}
      if(typeof got==='string')return {reply:got}
      // The verdict travels beside the words: the voice says what `outcome.say`
      // means, never a stronger claim than `outcome.state` allows.
      return {reply:got.text,...(got.outcome?{outcome:{state:got.outcome.state,say:got.outcome.say,...(got.outcome.proposal?{proposal:got.outcome.proposal}:{})}}:{})}
     }finally{busy.current=false;setWorking(false)}
    }
    return {error:'Unknown action'}
 }
}
