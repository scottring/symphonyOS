// The production chat component with scripted replies and in-memory records.
// No microphone, authentication, external model or household writes.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConversationStrip } from '../../src/components/canvas/ConversationStrip'
import { CanvasActivityProvider, useCanvasActivity } from '../../src/contexts/CanvasActivityContext'
import { applyChangeSet } from '../../src/lib/canvas/applyChangeSet'
import type { ChangeSet } from '../../src/lib/canvas/changeCard'
import type { ChatMessage } from '../../src/types/chat'
import { Store, ymd } from './store'
import '../../src/index.css'
import '../../src/styles/canvas.css'
import './duo-preview.css'

const duoStudy = new URLSearchParams(window.location.search).get('layout') === 'duo'
const studyNow=new Date()
const studyDay=(offset:number)=>ymd(new Date(studyNow.getFullYear(),studyNow.getMonth(),studyNow.getDate()+offset,12))!

const store = new Store([{ id: 'gate', title: 'Fix the gate latch', scheduledFor: duoStudy?studyDay(1):'2026-10-16', updatedAt: '2026-10-15T08:00:00Z' }])
const sample = 'I need to shower today at 4 p.m., take the bicycle to Bicycle Connection tomorrow, and buy the white bench.'
let sequence = 0
const proposal = (saturday = false): ChangeSet => ({ key: `chat-preview-${++sequence}`, title: '3 changes to your week', ops: [
  { key: 'shower', op: 'add', title: 'Shower', date: duoStudy?studyDay(0):'2026-10-15', time: '16:00' },
  { key: 'bicycle', op: 'add', title: 'Take bicycle to Bicycle Connection', date: duoStudy?studyDay(saturday?((7-studyNow.getDay())||7):1):saturday ? '2026-10-17' : '2026-10-16' },
  { key: 'bench', op: 'add', title: 'Buy the white bench' },
] })

function Scene() {
  const activity = useCanvasActivity()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [posture,setPosture]=useState<'pocket'|'open'|'stand'>('open')
  const [compactPane,setCompactPane]=useState<'plan'|'chat'>('chat')
  const send = (text: string) => {
    if (busy) return
    setMessages(history => [...history, { id: `user-${++sequence}`, role: 'user', content: text, timestamp: new Date() }])
    setBusy(true)
    activity.turnStarted(text, false)
    // Fixed delay exercises the waiting state; these are deliberately sample replies.
    setTimeout(() => {
      const correction = (duoStudy?/sunday/i:/saturday/i).test(text)
      const question = /what else/i.test(text)
      const reply = question ? `The gate latch is on ${duoStudy?new Date(`${studyDay(1)}T12:00:00`).toLocaleDateString('en-US',{weekday:'long'}):'Friday'}.` : correction
        ? `The bicycle is now on ${duoStudy?'Sunday':'Saturday'} in the draft. The shower and bench are unchanged.`
        : 'Here are the three changes for your review. You can change anything before saving.'
      if (!question) activity.setChangeSet(proposal(correction))
      activity.turnEnded({ didWrite: false, error: null, text: reply })
      setMessages(history => [...history, { id: `assistant-${++sequence}`, role: 'assistant', content: reply, timestamp: new Date() }])
      setBusy(false)
    }, 650)
  }
  const records=<section className="preview-records" aria-label="Saved preview items"><h2>Saved preview items</h2><p>These change only after Save or Undo.</p><ul>{[...store.tasks.values()].map(task => <li key={task.id}><strong>{task.title}</strong><span>{task.scheduledFor ? task.scheduledFor.toLocaleString('en-US', task.isAllDay?{weekday:'short'}:{ weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'No day yet'}</span></li>)}</ul></section>
  const instructions=<><ol><li>Send the sample message.</li><li>Use <strong>Make a change</strong> and ask for the bicycle on {duoStudy?'Sunday':'Saturday'}.</li><li>Save the draft, then Undo.</li></ol><button className="preview-button" onClick={() => { setDraft(sample); setOpen(true);setCompactPane('chat') }} disabled={busy}>Use sample message</button></>
  return <div className={duoStudy?'duo-study':undefined} data-posture={posture} data-pane={compactPane}>
    {duoStudy&&<header className="duo-study-header"><div><p className="preview-eyebrow">IPHONE DUO · LAYOUT STUDY</p><h1>Room to think. A place to act.</h1><p>Sample replies and temporary records. No live household changes. These are layout previews, not measured device dimensions.</p></div><div className="duo-postures" role="group" aria-label="Layout posture">{(['pocket','open','stand'] as const).map(p=><button key={p} aria-pressed={posture===p} onClick={()=>setPosture(p)}>{p==='pocket'?'Pocket':p==='open'?'Open':'On a stand'}</button>)}</div></header>}
    {duoStudy&&<nav className="duo-compact-tabs" aria-label="Compact workspace"><button aria-pressed={compactPane==='plan'} onClick={()=>setCompactPane('plan')}>My activities</button><button aria-pressed={compactPane==='chat'} onClick={()=>{setCompactPane('chat');setOpen(true)}}>Conversation</button></nav>}
    <main className="preview-layout">
    <section className="preview-guide">
      <p className="preview-eyebrow">{duoStudy?'THE BIGGER PICTURE':'CHAT INTERFACE PREVIEW'}</p>
      <h1>{duoStudy?'My activities':'A clearer conversation'}</h1>
      {!duoStudy&&<><p>This preview uses the real chat interface with sample replies. Saved items stay in this preview only.</p><p>The existing Week view is unchanged.</p>{instructions}</>}
      {records}
      {duoStudy&&<><details className="duo-goal-thread"><summary>Keep the bigger intention in view</summary><p>Example goal thread · separate from this task draft</p><ol><li>Year · A calmer home</li><li>Quarter · Make the spare room usable</li><li>Month · Clear the floor</li><li>Week · Sort one box</li></ol></details><details className="duo-instructions"><summary>Try this layout</summary>{instructions}<p>The existing Week view is unchanged. This study uses the real chat interface and sample replies.</p></details></>}
      <output data-testid="records" hidden>{JSON.stringify([...store.tasks.values()].map(task => ({ id: task.id, title: task.title, date: ymd(task.scheduledFor) ?? null, hour: task.scheduledFor?.getHours() ?? null })))}</output>
      {!open && <button className="preview-button" onClick={() => setOpen(true)}>Open chat</button>}
    </section>
    {open && <aside className="preview-panel"><ConversationStrip chatOnly panel draft={draft} onDraftChange={setDraft} onClose={() => setOpen(false)} busy={busy} messages={messages} onSend={send} voice={{ available: false, active: false, status: 'idle', start: () => {}, stop: () => {} }} /></aside>}
    </main>
  </div>
}
function App() {
  const [, update] = useState(0)
  const refresh = () => update(n => n + 1)
  return <CanvasActivityProvider snapshot={{ tasks: [...store.tasks.values()], goals: [] }} writers={{ deleteTask: async () => {}, updateTask: async () => {}, deleteGoal: async () => {}, updateGoal: async () => {} }} refetch={refresh} applyChanges={async set => {
    // Exercise a pending save and the production applier, without external services.
    await new Promise(resolve => setTimeout(resolve, 450))
    const result = await applyChangeSet(set, store.deps(duoStudy?studyNow:new Date('2026-10-11T12:00:00')))
    refresh()
    if (result.ok) { const undo = result.undo; result.undo = async () => { const ok = await undo(); refresh(); return ok } }
    return result
  }}><Scene /></CanvasActivityProvider>
}
createRoot(document.getElementById('root')!).render(<App />)
const style = document.createElement('style')
style.textContent = `body{margin:0;background:var(--color-bg-base)}.preview-layout{display:flex;height:100dvh}.preview-guide{flex:1;padding:48px;min-width:0;overflow:auto;max-width:960px}.preview-guide h1{font:36px var(--font-family-display);margin:12px 0 24px}.preview-guide>p{max-width:540px;line-height:1.6;color:var(--color-neutral-600)}.preview-eyebrow{font-size:12px;letter-spacing:.1em}.preview-guide ol{margin:32px 0;list-style:decimal;padding-left:20px;line-height:1.8}.preview-button{padding:10px 16px;border:1px solid var(--color-neutral-300);border-radius:10px}.preview-records{margin-top:48px;max-width:520px}.preview-records h2{font-size:18px}.preview-records p{font-size:13px;color:var(--color-neutral-500);margin:8px 0 20px}.preview-records li{border-top:1px solid var(--color-neutral-200);padding:14px 0;display:flex;justify-content:space-between;gap:20px;font-size:14px}.preview-records strong{font-weight:500}.preview-records span{white-space:nowrap;color:var(--color-neutral-600)}.preview-panel{width:420px;flex:none;margin-left:auto;border-left:1px solid var(--color-neutral-200)}@media(max-width:767px){.preview-layout:has(.preview-panel) .preview-guide{display:none}.preview-guide{padding:24px}.preview-panel{width:100%}}`
document.head.append(style)
