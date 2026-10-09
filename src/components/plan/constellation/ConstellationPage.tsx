import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { periodBounds, selectPeriodTasks, isCurrentPeriod } from '@/lib/planning/periodPage'
import { committedTo } from '@/lib/placement/model'
import { localYmd, parseLocalYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { useAddArea } from '../v2/AddArea'
import { planNodes, branchKeys, type PlanNode } from './model'
import './constellation.css'
const terms=['yearly intention','seasonal goal','monthly milestone','weekly action']
const tabs=['Year','Season','Month','Week']
function Inner(){
 const selection = useSelectionOptional()
 const {goals,loading:goalsLoading,error:goalsError,addGoal,updateGoal}=useGoalsContext()
 const {tasks,loading,error,addTask,updateTask,refetch}=useSupabaseTasks()
 const {layers}=useDomain(), [people]=useAssigneeFilter(), {getCurrentUserMember}=useFamilyMembers(), {seasons}=useHouseholdSeasons()
 const navigate=useNavigate(), [params,setParams]=useSearchParams(), area=useAddArea()
 const raw=params.get('start'), anchor=raw&&/^\d{4}-\d{2}-\d{2}$/.test(raw)?parseLocalYmd(raw):new Date()
 const safeAnchor=Number.isNaN(anchor.getTime())?new Date():anchor
 const level=Math.max(0,Math.min(3,Math.trunc(Number(params.get('horizon'))||0)))
 const season=periodBounds('season',safeAnchor,seasons), month=periodBounds('month',safeAnchor,seasons)
 const week=weekStartAnchor(safeAnchor,readCadenceConfig().weekStartsOn)
 const lens=planPeopleLens(people,getCurrentUserMember()?.id??null)
 const visible=filterTasksForLayers(tasks,layers).filter(lens.keep)
 const nodes=planNodes(goals.filter(g=>g.year===safeAnchor.getFullYear()&&g.status!=='archived'&&matchesLayers(g.context,layers)&&lens.keep(g)),[
  selectPeriodTasks(visible,'season',season.start,isCurrentPeriod(season,new Date()),lens.scopeId,seasons),
  selectPeriodTasks(visible,'month',month.start,isCurrentPeriod(month,new Date()),lens.scopeId,seasons),
  visible.filter(t=>committedTo(t,'week',week,{isCurrent:localYmd(week)===localYmd(weekStartAnchor(new Date(),readCadenceConfig().weekStartsOn))})!==undefined),
 ])
 const savedHeading=useRef<HTMLElement>(null)
 const [selected,setSelected]=useState<string|null>(params.get('focus'))
 const savedFocus=params.get('focus')
 useEffect(()=>{ if(savedFocus) setSelected(savedFocus) },[savedFocus])
 useEffect(()=>{ const refresh=()=>{void refetch()}; window.addEventListener('symphony-plan-updated',refresh); return ()=>window.removeEventListener('symphony-plan-updated',refresh) },[refetch])
 const [editor,setEditor]=useState<{node?:PlanNode;parent?:PlanNode;level:number;createId?:string;context?:'work'|'family'|'personal'|null}|null>(null)
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(editor)dialog.current?.showModal();else dialog.current?.close()},[editor])
 const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const edit=(node:PlanNode)=>{setEditor({node,level:node.level});setDraft(node.title);setMessage('')}
 const add=(l:number,parent?:PlanNode)=>{setEditor({level:l,parent,createId:crypto.randomUUID(),context:parent?parent.goal?parent.goal.context:parent.task?.context:area.area});setDraft('');setMessage('')}
 const save=async()=>{
  if(!editor||busy||!draft.trim())return
  setBusy(true);setMessage('')
  try{
   let ok=false
   if(editor.node){ok=editor.level===0?(await updateGoal(editor.node.id,{name:draft.trim()}))!==false:(await updateTask(editor.node.id,{title:draft.trim()}))!==false}
   else if(editor.level===0){ok=!!await addGoal(null,draft.trim(),editor.context??undefined,{year:safeAnchor.getFullYear(),id:editor.createId})}
   else {
    const parent=editor.parent, context=editor.context
    ok=!!await addTask(draft.trim(),undefined,undefined,undefined,{
     id:editor.createId, bucket:editor.level===1?'quarter':editor.level===2?'month':'week',
     ...(editor.level===1?{seasonStart:season.start}:editor.level===2?{monthStart:month.start}:{weekStart:week}),
     context, ...(parent?editor.level===1?{goalId:parent.id}:{sourceId:parent.id,goalId:parent.task?.goalId}:{}),
    })
   }
   if(ok){setEditor(null);setDraft('');setMessage('Saved to your plan.')}else setMessage('Could not save. Your wording is still here; try again.')
  }catch{setMessage('Could not save. Your wording is still here; try again.')}finally{setBusy(false)}
 }
 const periodLabels=[String(safeAnchor.getFullYear()),season.label,month.label,`Week of ${week.toLocaleDateString()}`]
 const focus=nodes.find(n=>n.key===selected)
 const visibleFocusKey=focus?.key
 useEffect(()=>{if(visibleFocusKey&&!editor)savedHeading.current?.scrollIntoView({block:'start',behavior:'auto'})},[visibleFocusKey,editor])
 const related=branchKeys(nodes,selected)
 const clearFocus=()=>{setSelected(null);const p=new URLSearchParams(params);p.delete('focus');setParams(p,{replace:true})}
 const choose=(key:string)=>{if(key===selected){clearFocus();return}setSelected(key);const p=new URLSearchParams(params);p.delete('focus');setParams(p,{replace:true})}
 const shown=focus?nodes.filter(n=>related.has(n.key)):nodes
 return <main className="cp-page"><p className="cp-caption">YOUR PLANNING MAP</p><h1>{periodLabels[level]}</h1><p>Build each horizon across your plans. Select a card to focus on its branch. Show all plans to return to the full picture. Current filters apply.</p><div className="cp-nav"><label>Planning date <input type="date" value={localYmd(safeAnchor)} disabled={!!editor} onChange={e=>{if(e.target.value){const p=new URLSearchParams(params);p.set('start',e.target.value);setParams(p);setSelected(null)}}}/></label>{tabs.map((t,i)=><button key={t} disabled={!!editor} aria-current={level===i?'page':undefined} onClick={()=>{const p=new URLSearchParams(params);p.set('horizon',String(i));setParams(p);document.getElementById(`horizon-${i}`)?.scrollIntoView({block:'nearest',behavior:'smooth'})}}>{t}</button>)}<button onClick={()=>navigate('/today?view=alongside')} disabled={!!editor}>Today →</button></div>
 {(loading||goalsLoading)&&<p role="status">Loading your plans…</p>}{(error||goalsError)?<p role="alert">Plans could not load. <button onClick={()=>{if(goalsError)window.location.reload();else void refetch()}}>Retry</button></p>:<> {focus&&<section ref={savedHeading} className="hz-detail" aria-label="Selected plan item"><div><small>{terms[focus.level]} · {periodLabels[focus.level]}</small><h2>{focus.title}</h2>{savedFocus===focus.key&&<><p className="hz-lineage">{nodes.filter(n=>related.has(n.key)&&n.level<focus.level).sort((a,b)=>a.level-b.level).map(n=>n.title).join(' → ')}</p><small className="hz-saved">Saved{focus.task?.scheduledFor?` · ${focus.task.scheduledFor.toLocaleDateString()}${!focus.task.isAllDay?' at '+focus.task.scheduledFor.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):''}`:' to your plan'}</small></>}</div><button className="cp-edit" disabled={!!editor} onClick={()=>edit(focus)}>Edit<span className="sr-only"> {focus.title}</span></button>{focus.task&&selection&&<button className="cp-edit" onClick={()=>selection.setSelection({kind:'task',id:focus.id})}>Open details</button>}{focus.level<3?<button className="cp-add" disabled={!!editor} onClick={()=>add(focus.level+1,focus)}>+ Add a {terms[focus.level+1]}</button>:<button className="cp-add" onClick={()=>navigate(`/week?view=alongside&start=${localYmd(week)}`)}>Schedule or complete in Week →</button>}</section>}{focus&&<div className="hz-focus-bar"><span role="status">Showing {shown.length} connected {shown.length===1?'item':'items'} · {nodes.length-shown.length} hidden</span><button type="button" disabled={!!editor} onClick={clearFocus}>Show all plans</button></div>}<div className={`hz-grid ${focus?'is-focused':''}`}>{tabs.map((tab,i)=><section id={`horizon-${i}`} key={tab} className={`hz-zone hz-zone-${i} ${level===i?'hz-active':''}`} aria-label={`${tab} plans`}>
 <header><h2>{tab}</h2><p>{terms[i]}s · {periodLabels[i]}</p></header><div className="hz-column-body" role="region" aria-label={`${tab} cards`} tabIndex={0}>
 {shown.filter(n=>n.level===i).map(n=><button key={n.key} className={`hz-item ${selected===n.key?'hz-selected':related.has(n.key)?'hz-related':''}`} aria-pressed={selected===n.key} disabled={!!editor} onClick={()=>choose(n.key)}>
 <span>{n.title}</span>{savedFocus===n.key&&<small className="hz-saved" role="status">Saved to your plan</small>}<small>{n.parent?nodes.find(p=>p.key===n.parent)?.title:'Independent '+terms[i]}</small>{n.task?.completed&&<small>Completed</small>}{n.task?.scheduledFor&&<small>Scheduled {n.task.scheduledFor.toLocaleDateString()}{!n.task.isAllDay&&` · ${n.task.scheduledFor.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`}</small>}
 </button>)}
 {!shown.some(n=>n.level===i)&&!loading&&!goalsLoading&&<p className="cp-empty">{focus?'No connected items at this horizon.':'Nothing here for this period and filter yet.'}</p>}
 {!focus&&<button className="cp-add" disabled={!!editor||loading||goalsLoading} onClick={()=>add(i)}>+ Add an independent {terms[i]}</button>}</div>
 </section>)}</div>

 <div className="cp-new">{area.picker}<span className="cp-caption">Life area for new independent entries</span></div></>}

 <dialog ref={dialog} className="cp-editor" aria-label="Plan wording" onCancel={e=>{if(busy)e.preventDefault();else setEditor(null)}} onClose={()=>{if(!busy)setEditor(null)}}>{editor&&<form aria-label={editor.node?'Edit plan item':'Add plan item'} onSubmit={e=>{e.preventDefault();void save()}}><h2>{editor.node?'Edit':'Add'} {terms[editor.level]}</h2><p>{periodLabels[editor.level]}{editor.parent?` · Under ${editor.parent.title}`:''}</p><label>Wording<input autoFocus value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/></label><button disabled={busy||!draft.trim()}>{busy?'Saving…':'Save'}</button><button type="button" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button><p role="status">{message}</p></form>}</dialog>
 {!editor&&<p role="status">{message}</p>}</main>
}
export function ConstellationPage(){return <GoalsProvider><Inner/></GoalsProvider>}
