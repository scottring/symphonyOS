import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Send } from 'lucide-react'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
import type { ChangeCardNote, ChangeSet } from '@/lib/canvas/changeCard'
import { activityStoryNote, activityWhere, isActivityStoryDraft, saveActivityStory, type ActivityReceipt } from '@/lib/activityStory'
import type { SetupContext } from '@/lib/onboarding'

interface Props {user:User;context:SetupContext;goalJourney?:boolean;onSaved:(items:ActivityReceipt[])=>Promise<void>;onWorking:(busy:boolean)=>void}
export function ActivityStory({user,context,goalJourney=false,onSaved,onWorking}:Props) {
  const storageKey=`symphony.setup.activities.${user.id}${goalJourney?'.goals':''}`
  const [stored]=useState(()=>{
    try {return JSON.parse(localStorage.getItem(storageKey)??'{}') as {card?:unknown;draft?:string;note?:ChangeCardNote;attempted?:boolean;receipts?:ActivityReceipt[]}} catch {return {}}
  })
  const [card,setCard]=useState<ChangeSet|null>(isActivityStoryDraft(stored.card)?stored.card:null)
  const [draft,setDraft]=useState(()=>{
    if(typeof stored.draft==='string')return stored.draft
    try {const old=JSON.parse(localStorage.getItem(`symphony.setup.draft.${user.id}${goalJourney?'.goals':''}`)??'{}');return typeof old.title==='string'?old.title:''} catch {return ''}
  })
  const [note,setNote]=useState(stored.note)
  const [attempted,setAttempted]=useState(!!stored.attempted && !!card)
  const [receipts,setReceipts]=useState<ActivityReceipt[]>(Array.isArray(stored.receipts)?stored.receipts:[])
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const lock=useRef(false)
  const assistant=useSymphonyAssistant({surface:'onboarding_activity',persistKey:goalJourney?'symphony_onboarding_goals':'symphony_onboarding_activities',turnObserver:{
    changeCard:()=>card?activityStoryNote(card,'pending'):note,
    changeSet:set=>{if(attempted)return;if(!isActivityStoryDraft(set)){setError('I couldn’t prepare that draft reliably. Tell me a little more about where it belongs.');return}setCard(set);setError(null)},
  }})
  const {sessions,sessionsLoading,sessionsError,messages,loading,loadSession}=assistant
  const restored=useRef(false)
  useEffect(()=>{if(!restored.current&&sessions.length&&!messages.length&&!loading&&!sessionsLoading){restored.current=true;loadSession(sessions[0])}},[sessions,messages.length,loading,sessionsLoading,loadSession])
  useEffect(()=>{try {localStorage.setItem(storageKey,JSON.stringify({card,draft,note,attempted,receipts}))}catch{/* active session remains usable */}},[storageKey,card,draft,note,attempted,receipts])
  const historyLoading=!!sessionsLoading||(!restored.current&&sessions.length>0&&!messages.length)
  const working=assistant.loading||saving||historyLoading
  useEffect(()=>{onWorking(working);return()=>onWorking(false)},[working,onWorking])
  async function save() {
    if(!card||lock.current||working)return
    lock.current=true;setSaving(true);setError(null)
    // Persist the locked draft BEFORE writing: reload cannot turn a partial save
    // into an editable proposal with fresh IDs.
    try {localStorage.setItem(storageKey,JSON.stringify({card,draft,note,attempted:true,receipts}))}catch{setError('This browser cannot keep a recovery copy. Enable website storage before saving.');setSaving(false);lock.current=false;return}
    setAttempted(true)
    try {
      const result=await saveActivityStory(user.id,card,context)
      await onSaved(result)
      setNote(activityStoryNote(card,'approved'));setCard(null);setAttempted(false);setReceipts(result)
    }catch(e){if(e instanceof Error&&e.name==='ActivityDraftInvalid'&&!attempted){setAttempted(false);setError(e.message)}else setError(`${e instanceof Error?e.message:'Could not confirm the save.'} Your draft is kept. Retry checks what already saved before adding anything.`)}finally{setSaving(false);lock.current=false}
  }
  return <div className="routine-story activity-story">
    <p className="routine-story-invitation">{goalJourney?'What would you like to work toward? Tell me what’s on your mind and we’ll find a useful place to start.':'What’s on your mind? Tell me about things you want to do, ideas you’re holding, or goals you’d like to move forward.'}</p>
    <p className="onboarding-muted">No need to organize it first. I’ll help give your intentions a place. You decide what to save.</p>
    {sessionsError&&<div className="onboarding-error" role="alert">{sessionsError}<button className="onboarding-link" onClick={assistant.reloadSessions}>Restore conversation again</button></div>}
    <div className="routine-story-messages" aria-live="polite">{assistant.messages.filter(m=>m.content.trim()).map(m=><ChatMessage key={m.id} message={m}/>)}{historyLoading&&<p role="status">Restoring your conversation…</p>}{assistant.loading&&<p role="status">Symphony is thinking…</p>}</div>
    {(error||assistant.error)&&<div role="alert" className="onboarding-error">{error??assistant.error}{assistant.error&&!attempted&&<button className="onboarding-link" disabled={working} onClick={()=>void assistant.retryLast()}>Try that message again</button>}</div>}
    {card&&<section className="routine-story-draft" aria-label="Activity draft">
      <div className="routine-story-draft-heading"><h2>Your intentions, taking shape</h2><span>{saving?'Saving…':attempted?'Save needs confirmation':'Not saved'}</span></div>
      <ul>{card.ops.map(o=><li key={o.key}><strong>{o.title}</strong><span>{activityWhere(o)}</span>{o.note&&<span>{o.note}</span>}{o.parentId&&<span>Supports {o.parentTitle??'your existing goal'}</span>}{o.goalId&&<span>Supports your existing monthly goal</span>}<small>{o.context==='family'?'Household':o.context==='work'?'Work':'Personal'}{o.assignee?` · ${context.members.find(m=>m.id===o.assignee)?.name??'Assigned member'}`:''}{o.context!=='family'&&!o.assignee?' · Visible to you':''}</small></li>)}</ul>
      <p>{saving?'Checking that each item is saved in its place…':attempted?'Some items may already be saved. Confirm this save before changing the draft.':'Tell me what to change, or save when it looks right.'}</p>
      <div className="routine-story-actions"><button className="btn-primary" disabled={working} onClick={()=>void save()}>{saving?'Confirming saves…':attempted?'Retry save':`Save ${card.ops.length===1?'this item':`these ${card.ops.length} items`}`}</button><button className="onboarding-link" disabled={working||attempted} onClick={()=>{setNote(activityStoryNote(card,'dismissed'));setCard(null);setError(null)}}>Leave this draft</button></div>
    </section>}
    {receipts.length>0&&<section className="onboarding-receipt" role="status"><div><strong>Saved</strong><ul>{receipts.map(r=><li key={r.id}>{r.title} — {r.where}</li>)}</ul><p>You can keep talking or continue when you’re ready.</p></div></section>}
    <form className="routine-story-composer" onSubmit={e=>{e.preventDefault();if(!draft.trim()||working||attempted||sessionsError)return;const text=draft.trim();setDraft('');setError(null);void assistant.sendMessage(text)}}>
      <textarea aria-label="Message Symphony" placeholder="Message Symphony…" value={draft} onChange={e=>setDraft(e.target.value)} disabled={working||attempted||!!sessionsError} rows={3}/>
      <button className="btn-primary" type="submit" aria-label="Send message" disabled={working||attempted||!!sessionsError||!draft.trim()}><Send size={17}/>Send</button>
    </form>
  </div>
}
