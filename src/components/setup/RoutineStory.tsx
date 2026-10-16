import { useEffect, useRef, useState } from 'react'
import { Check, Send } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { useSymphonyAssistant } from '@/hooks/useSymphonyAssistant'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { changeCardNote, type ChangeCardNote, type ChangeSet } from '@/lib/canvas/changeCard'
import { isRoutineStoryDraft, saveRoutineStory } from '@/lib/onboardingStory'
import { scheduleReadback } from '@/lib/routineReadback'
import type { SetupContext } from '@/lib/onboarding'

interface Props { user:User; context:SetupContext; onSaved:()=>Promise<void>; onWorking:(working:boolean)=>void }
export function RoutineStory({user,context,onSaved,onWorking}:Props) {
  const storageKey = `symphony.setup.story.${user.id}`
  const [stored] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)??'{}') as {card?:unknown;draft?:string;note?:ChangeCardNote} } catch {return {}}
  })
  const [card,setCard] = useState<ChangeSet|null>(isRoutineStoryDraft(stored.card)?stored.card:null)
  const [note,setNote] = useState<ChangeCardNote|undefined>(stored.note)
  const [draft,setDraft] = useState(typeof stored.draft==='string'?stored.draft:'')
  const [saving,setSaving] = useState(false)
  const [savedCount,setSavedCount] = useState(0)
  const [error,setError] = useState<string|null>(null)
  const saveLock = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const assistant = useSymphonyAssistant({
    surface:'onboarding', persistKey:'symphony_onboarding_routines',
    turnObserver:{
      changeCard:()=>card?changeCardNote(card,'pending'):note,
      changeSet:set=>{
        if (!isRoutineStoryDraft(set)) {setError('I couldn’t prepare that routine draft reliably. Please tell me a little more about when it repeats.');return}
        setCard(set);setError(null);setSavedCount(0)
      },
    },
  })
  const {sessions,messages,loading,loadSession,sessionsLoading}=assistant
  const restored = useRef(false)
  useEffect(()=>{
    if (!restored.current && sessions.length && !messages.length && !loading && !sessionsLoading) {
      restored.current=true;loadSession(sessions[0])
    }
  },[sessions,messages.length,loading,sessionsLoading,loadSession])
  useEffect(()=>{
    try {localStorage.setItem(storageKey,JSON.stringify({card,draft,note}))} catch { /* Keep the active conversation usable. */ }
  },[storageKey,card,draft,note])
  const historyLoading=!!sessionsLoading||(!restored.current&&sessions.length>0&&!messages.length)
  useEffect(()=>{onWorking(loading||saving||historyLoading);return()=>onWorking(false)},[loading,saving,historyLoading,onWorking])

  async function save() {
    if (!card || saveLock.current || assistant.loading) return
    saveLock.current=true;setSaving(true);setError(null)
    try {
      const saved=await saveRoutineStory(user.id,card,context.members)
      await onSaved()
      setNote(changeCardNote(card,'approved'));setCard(null);setSavedCount(saved.length)
    } catch (failure) {setError(failure instanceof Error && failure.name==='RoutineDraftChanged' ? failure.message : 'I couldn’t confirm all the saves. Your draft is still here. Try Save routines again; it checks what already saved before adding anything.')}
    finally {saveLock.current=false;setSaving(false)}
  }
  function discard() {if(card)setNote(changeCardNote(card,'dismissed'));setCard(null);setError(null)}
  const working=loading||saving||historyLoading
  return <div className="routine-story">
    <p className="routine-story-invitation">Tell me what a typical week looks like—whatever comes to mind. I’ll pick out the recurring parts for you to check.</p>
    <p className="onboarding-muted">No need to organize it first. You can also tell me which routines to show or hide in Today and Week.</p>
    {historyLoading&&<p role="status">Restoring your conversation…</p>}
    {assistant.sessionsError&&<div role="alert" className="onboarding-error">{assistant.sessionsError}<button className="onboarding-link" onClick={assistant.reloadSessions}>Restore conversation again</button></div>}
    {context.routines.length>0&&<details className="routine-story-known"><summary>Already part of your week · {context.routines.length}</summary><ul>{context.routines.map(r=><li key={r.id}><strong>{r.name}</strong><span>{scheduleReadback(r.recurrence_pattern,r.time_of_day)}</span>{r.description&&<span>{r.description}</span>}<small>{r.show_on_timeline===false?'Hidden from Today and Week · Kept in Routines':'Show in Today and Week when due'}</small></li>)}</ul></details>}
    <div className="routine-story-messages" aria-live="polite">
      {assistant.messages.filter(m=>m.content.trim()).map(m=><ChatMessage key={m.id} message={m}/>)}
      {assistant.loading&&<p role="status" className="onboarding-muted">Symphony is making sense of your week…</p>}
    </div>
    {(error||assistant.error)&&<div role="alert" className="onboarding-error">{error??assistant.error}{assistant.error&&<button className="onboarding-link" disabled={working} onClick={()=>void assistant.retryLast()}>Try that message again</button>}</div>}
    {card&&<section className="routine-story-draft" aria-label="Routine draft">
      <div className="routine-story-draft-heading"><h2>{card.ops.some(op=>op.op==='routine_change')?'Your routine choices':'The recurring parts I heard'}</h2><span>Not saved</span></div>
      <ul>{card.ops.map(op=><li key={op.key}><strong>{op.title}</strong>{op.op==='routine_add'&&<span>{scheduleReadback({type:'weekly',days:op.days!},op.time??null)}</span>}
        {op.note&&<span>{op.note}</span>}
        <span>{op.showOnTimeline===false?'Hidden from Today and Week · Kept in Routines':'Show in Today and Week when due'}</span>
        {op.op==='routine_change'?<small>Existing routine · Display change only</small>:<small>{op.assignees?.map(id=>context.members.find(m=>m.id===id)?.name).filter(Boolean).join(', ')||'No one assigned'} · {op.context==='personal'?'Personal':'Household'}</small>}</li>)}</ul>
      <p>Tell me what to change, or save these routines when they look right.</p>
      <div className="routine-story-actions"><button className="btn-primary" disabled={working} onClick={()=>void save()}>{saving?'Saving routines…':`Save ${card.ops.length===1?'routine':`${card.ops.length} routines`}`}</button><button className="onboarding-link" disabled={working} onClick={discard}>Leave this draft</button></div>
    </section>}
    {savedCount>0&&<p role="status" className="onboarding-receipt"><Check size={18}/>{savedCount===1?'Your routine is saved.':`Your ${savedCount} routines are saved.`} You can keep telling me about your week.</p>}
    <form className="routine-story-composer" onSubmit={e=>{e.preventDefault();if(!draft.trim()||working||assistant.sessionsError)return;const text=draft.trim();setDraft('');setError(null);void assistant.sendMessage(text)}}>
      <textarea ref={input} aria-label="Message Symphony" placeholder="For example, weekday mornings usually start with…" value={draft} onChange={e=>setDraft(e.target.value)} disabled={working||!!assistant.sessionsError} rows={3}/>
      <button className="btn-primary" type="submit" disabled={working||!!assistant.sessionsError||!draft.trim()} aria-label="Send message"><Send size={17}/>Send</button>
    </form>
  </div>
}
