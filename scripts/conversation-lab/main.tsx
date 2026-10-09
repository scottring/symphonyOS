import { useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { HORIZONS, LEVEL_NAME, FREE, newDraft, reduce, horizonOf, isCheck, readDraft, writeDraft, type Horizon, type FlowAction, type VoicePlanDraft } from '../../src/lib/voiceOnboarding/flow'
import './style.css'

const KEY = 'isolated-conversation-lab'
const samples = ['Feel stronger and healthier', 'Enjoy more time together', 'Do work that matters', 'Make home a calmer place']
const descriptions = ['Make room for what matters. Then bring it into this season, month, week and day.', 'Choose what you want to move forward over the next few months.', 'Give this month a little direction, then make a practical weekly plan.', 'Turn what matters now into a manageable week.', 'Choose a few things you can actually do today.']
const symbols = ['◉','◒','▤','▦','☀']
const questions: Record<Horizon,string> = {
  year: 'What would make this a good year for you?',
  season: 'What would meaningful progress look like this season?',
  month: 'What would you like to have in place this month?',
  week: 'What could you actually do this week?',
  today: 'What belongs on today’s list?'
}
const hints: Record<Horizon,string> = {
  year: 'Think across your life. Four or five intentions can be a useful starting point. Add them one at a time, in your own words.',
  season: 'Consider each intention before moving on. Some can wait; not everything needs attention this season.',
  month: 'Keep the seasonal picture beside you. A monthly priority describes what you want to move forward.',
  week: 'Choose concrete actions across your priorities. Leave room for ordinary life, too.',
  today: 'Choose from this week or add something new. These are the same tasks, not another copy.'
}
function Editable({text, onChange}: {text:string; onChange:(s:string)=>void}) {
  const [editing,setEditing]=useState(false)
  const [value,setValue]=useState(text)
  return editing ? <form onSubmit={e=>{e.preventDefault(); if(value.trim()){onChange(value);setEditing(false)}}}><input autoFocus aria-label="Edit plan item" value={value} maxLength={140} onChange={e=>setValue(e.target.value)}/><button>Keep change</button><button type="button" onClick={()=>setEditing(false)}>Cancel</button></form> : <button className="item-text" title="Edit this item" onClick={()=>{setValue(text);setEditing(true)}}>{text}<span className="edit-mark">↗</span></button>
}
function App() {
  const [draft,setDraft]=useState<VoicePlanDraft|null>(()=>readDraft(KEY))
  const [paused,setPaused]=useState(false)
  const [text,setText]=useState('')
  const [notice,setNotice]=useState('')
  const [storageError,setStorageError]=useState(false)
  const input=useRef<HTMLTextAreaElement>(null)
  const store=(d:VoicePlanDraft)=>{setDraft(d);setStorageError(!writeDraft(KEY,d))}
  const act=(a:FlowAction)=>{if(draft)store(reduce(draft,a))}
  const start=(h:Horizon)=>{store(newDraft(h));setPaused(false);setNotice('');setText('')}
  const sample=()=>{let d=newDraft('year'); for(const s of samples)d=reduce(d,{type:'addGoal',text:s});store(d)}
  const h=draft ? horizonOf(draft.step) : 'year'
  const review=h==='review'
  const check=!!draft && isCheck(draft.step)
  const focus=draft?.goals.find(g=>g.id===draft.focus)
  const steps=draft ? HORIZONS.slice(HORIZONS.indexOf(draft.startAt)) : HORIZONS
  const index=review ? steps.length : steps.indexOf(h as Horizon)
  const add=()=>{
    if(!draft||!text.trim())return
    const next=reduce(draft,{type:'answer',text})
    if(next===draft){setNotice('That item may already be here, or this section is full. Your words are still below.');return}
    store(next);setNotice(`Added to ${LEVEL_NAME[h as Horizon].toLowerCase()}${focus ? ` · ${focus.title}` : ''}. Keep going, or review this part when you’re ready.`);setText('');input.current?.focus()
  }
  const goNext=()=>{if(text.trim()){setNotice('Add your answer before continuing, or clear it if you don’t want to keep it.');input.current?.focus();return}act({type:'continue'});setNotice('')}
  const lines=(level:Horizon)=>!draft ? [] : level==='year' ? draft.goals.map(g=>({id:g.id,text:g.title,goalId:null})) : level==='today' ? draft.week.filter(w=>draft.today.includes(w.id)) : draft[level]
  return <div className="lab">
    <header><a href="./index.html" className="brand">✳ <span>SYMPHONY</span></a><span className="prototype">CONVERSATION STUDY · LOCAL ONLY</span>{draft && <div><button className="quiet" onClick={()=>setPaused(!paused)}>{paused?'Resume':'Pause here'}</button><button className="quiet" onClick={()=>{if(confirm('Clear this local rehearsal and choose a new starting point?')){writeDraft(KEY,null);setDraft(null);setText('');setNotice('')}}}>Start fresh</button></div>}</header>
    {!draft ? <main className="welcome"><span className="eyebrow">A LITTLE ROOM TO THINK</span><h1>What matters to you.<br/><em>A way to begin.</em></h1><p>We’ll shape a plan together, one part at a time.<br/>How far ahead would you like to look?</p><div className="horizon-choices">{HORIZONS.map((period,i)=><button key={period} onClick={()=>start(period)}><span className="symbol">{symbols[i]}</span><strong>{period==='today'?'Just today':`This ${period}`}</strong><span>{descriptions[i]}</span><small>{5-i} {i===4?'part':'parts'} · go at your own pace →</small></button>)}</div><button className="sample" onClick={sample}>Or explore with four example intentions →</button><p className="disclaimer">A scripted, typed rehearsal. No live AI, microphone, or account connection.</p></main> : paused ? <main className="welcome"><span className="eyebrow">ROOM TO BREATHE</span><h1>We can pick up here.</h1><p>Your prototype plan is held in this browser.<br/>You’re at {review?'the finish':LEVEL_NAME[h as Horizon].toLowerCase()}.</p><button className="primary" onClick={()=>setPaused(false)}>Continue our planning →</button>{storageError&&<p role="alert">Browser storage is unavailable. Keep this tab open to keep your draft.</p>}</main> : <>
      <nav className="progress" aria-label="Planning progress">{steps.map((period,i)=><button key={period} aria-current={h===period?'step':undefined} onClick={()=>{if(text.trim()){setNotice('Keep or clear your current answer first.');return}act({type:'edit',level:period});setNotice('')}}><span>{i<index?'✓':i+1}</span>{LEVEL_NAME[period]}</button>)}<span className="progress-note">{review?'Your plan, together':`${index+1} of ${steps.length} parts`}</span></nav>
      <main className="workspace"><section className="conversation"><span className="eyebrow">{review?'A PLACE TO BEGIN':check?'LET’S LOOK AT IT TOGETHER':`LET’S THINK ABOUT ${h==='today'?'TODAY':`YOUR ${h.toUpperCase()}`}`}</span><div className="orb" aria-hidden="true">✳</div>
        <h1>{review?'You’ve made room for what matters.':check?`How does your ${h} feel as a whole?`:questions[h as Horizon]}</h1>
        <p className="lead">{review?'Here’s the path from your bigger picture to things you can do. You can revisit any part without starting again.':check?'Look across everything you’ve chosen. Is there room for it in your life? You can edit any line on the right, or leave something for later.':hints[h as Horizon]}</p>
        {!review&&!check&&h!=='year'&&h!=='today'&&<div className="focus-box"><label htmlFor="intention">Thinking about</label><select id="intention" value={draft.focus} onChange={e=>{if(text.trim()){setNotice('Add or clear your answer before changing its connection.');return}act({type:'focus',goal:e.target.value})}}>{draft.goals.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}<option value={FREE}>Something else — no connection needed</option></select>{focus&&<p className="context">{(h==='month'?draft.season:h==='week'?draft.month:[]).filter(x=>x.goalId===focus.id).map(x=>x.text).join(' · ')||'Your own words are enough. We can make them more specific as we go.'}</p>}</div>}
        {!review&&!check&&(h==='season'||h==='month')&&<div className="intention-strip" aria-label="Intentions at this horizon">{draft.goals.map(g=><button key={g.id} aria-pressed={draft.focus===g.id} onClick={()=>{if(text.trim()){setNotice('Keep or clear your answer first.');return}act({type:'focus',goal:g.id})}}>{draft[h].some(x=>x.goalId===g.id)?'✓ ':''}{g.title}</button>)}</div>}
        <div className="reply" role="status">{notice}</div>
        {!review&&!check&&<form onSubmit={e=>{e.preventDefault();add()}}><label className="sr-only" htmlFor="answer">Your answer</label><div className="composer"><textarea id="answer" ref={input} value={text} maxLength={140} placeholder={h==='year'?'“I’d like to…”':'Say it in your own words…'} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();add()}}}/><button className="send" disabled={!text.trim()} aria-label="Add answer">↑</button></div><small className="input-note">Enter to add · Shift + Enter for a new line · typed rehearsal</small></form>}
        {h==='year'&&!check&&!draft.goals.length&&<div className="suggestions">{samples.slice(0,3).map(s=><button key={s} onClick={()=>{setText(s);input.current?.focus()}}>{s} ↗</button>)}</div>}
        {h==='today'&&!check&&<div className="today-picks">{draft.week.map(w=><label key={w.id}><input type="checkbox" checked={draft.today.includes(w.id)} onChange={()=>act({type:'toggleToday',id:w.id})}/>{w.text}</label>)}</div>}
        {check&&(h==='season'||h==='month')&&draft.goals.some(g=>!draft[h].some(l=>l.goalId===g.id))&&<p className="context">Not chosen for this {h}: {draft.goals.filter(g=>!draft[h].some(l=>l.goalId===g.id)).map(g=>g.title).join(' · ')}. You can revisit these above, or let them wait.</p>}
        <div className="next">{review?<button className="primary" onClick={()=>setPaused(true)}>Finish this rehearsal ✓</button>:<button className="primary" onClick={goNext}>{check?`Continue to ${steps[index+1]||'today'} →`:h==='today'?'See my whole plan →':`Review my ${h} →`}</button>}{!review&&!check&&(h==='season'||h==='month')&&<button className="quiet" onClick={()=>{if(text.trim()){setNotice('Keep or clear your answer first.');return}act({type:'nextGoal'});setNotice('Same horizon, another intention.')}}>Think about another intention →</button>}</div>
        {storageError&&<p role="alert">Your draft could not be saved in this browser. Keep this tab open.</p>}
        <p className="disclaimer">This is a design rehearsal. Your words stay in this browser; nothing is saved to Symphony. Replies are scripted, not AI.</p>
      </section><aside className="plan"><div className="plan-heading"><div><span className="eyebrow">TAKING SHAPE</span><h2>Your plan</h2></div><span className="local">LOCAL DRAFT</span></div><p className="plan-help">All your intentions stay in view.<br/>Click any line to change its words.</p>
        {steps.filter(p=>review||steps.indexOf(p)<=index).map(period=><section className={`plan-section ${h===period?'active':''}`} key={period}><h3><span>{symbols[HORIZONS.indexOf(period)]}</span>{LEVEL_NAME[period]}<small>{lines(period).length} {period==='week'||period==='today'?(lines(period).length===1?'action':'actions'):(lines(period).length===1?'idea':'ideas')}</small></h3>{lines(period).length?lines(period).map(line=><div className="plan-item" key={line.id}>{line.goalId&&<small>{draft.goals.find(g=>g.id===line.goalId)?.title}</small>}<Editable text={line.text} onChange={value=>{if(period==='year')act({type:'renameGoal',id:line.id,text:value});else if(period==='season'||period==='month')act({type:'editLine',level:period,id:line.id,text:value});else act({type:'editWeek',id:line.id,text:value})}}/></div>):<p className="empty">{h===period?'Your next answer will appear here.':'Nothing chosen here yet. You can come back.'}</p>}</section>)}
        {!review&&<p className="path-note">{steps.slice(index+1).map(p=>LEVEL_NAME[p]).join(' → ')}{index<steps.length-1?' comes next.':''}</p>}
      </aside></main></>}
  </div>
}
createRoot(document.getElementById('root')!).render(<App />)
