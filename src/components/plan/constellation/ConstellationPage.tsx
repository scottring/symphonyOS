import { TaskFateMenu } from '@/components/schedule/TaskFateMenu'
import { applyTriageWhen, describeTriageWhen } from '@/lib/triage/applyWhen'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { ConnectionCanvas } from './ConnectionCanvas'
import { connectionPair, connectionPatch, priorConnection } from './connections'
import type { Task } from '@/types/task'
import { relinkUpdates, MONTH_TO_SEASON, WEEK_TO_MONTH } from '@/lib/planning/journalGroups'
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
 const {tasks,loading,error,addTask,updateTask,refetch,pushTask,setBucket,updateTasksBulk,toggleTask,deleteTask,keepForward,dropCommitment}=useSupabaseTasks()
 const gated=useGatedTaskActions({updateTask,pushTask,setBucket,updateTasksBulk},id=>tasks.find(t=>t.id===id))
 const {layers}=useDomain(), [people]=useAssigneeFilter(), {getCurrentUserMember}=useFamilyMembers(), {seasons}=useHouseholdSeasons()
 const navigate=useNavigate(), [params,setParams]=useSearchParams(), area=useAddArea()
 const raw=params.get('start'), anchor=raw&&/^\d{4}-\d{2}-\d{2}$/.test(raw)?parseLocalYmd(raw):new Date()
 const safeAnchor=Number.isNaN(anchor.getTime())?new Date():anchor
 const level=Math.max(0,Math.min(3,Math.trunc(Number(params.get('horizon'))||0)))
 const season=periodBounds('season',safeAnchor,seasons), month=periodBounds('month',safeAnchor,seasons)
 const week=weekStartAnchor(safeAnchor,readCadenceConfig().weekStartsOn)
 const lens=planPeopleLens(people,getCurrentUserMember()?.id??null)
 const visible=filterTasksForLayers(tasks,layers).filter(lens.keep)
 const [showCompleted,setShowCompleted]=useState(false)
 const allNodes=planNodes(goals.filter(g=>g.year===safeAnchor.getFullYear()&&g.status!=='archived'&&matchesLayers(g.context,layers)&&lens.keep(g)),[
  selectPeriodTasks(visible,'season',season.start,isCurrentPeriod(season,new Date()),lens.scopeId,seasons),
  selectPeriodTasks(visible,'month',month.start,isCurrentPeriod(month,new Date()),lens.scopeId,seasons),
  visible.filter(t=>committedTo(t,'week',week,{isCurrent:localYmd(week)===localYmd(weekStartAnchor(new Date(),readCadenceConfig().weekStartsOn))})!==undefined),
 ])
 const completedCount=allNodes.filter(n=>n.task?.completed||n.goal?.status==='completed').length
 const nodes=showCompleted?allNodes:allNodes.filter(n=>!n.task?.completed&&n.goal?.status!=='completed')
 const savedHeading=useRef<HTMLElement>(null)
 const [selected,setSelected]=useState<string|null>(params.get('focus'))
 const savedFocus=params.get('focus')
 useEffect(()=>{ if(savedFocus) setSelected(savedFocus) },[savedFocus])
 useEffect(()=>{ const refresh=()=>{void refetch()}; window.addEventListener('symphony-plan-updated',refresh); return ()=>window.removeEventListener('symphony-plan-updated',refresh) },[refetch])
 const [editor,setEditor]=useState<{node?:PlanNode;parent?:PlanNode;level:number;createId?:string;context?:'work'|'family'|'personal'|null;link?:boolean}|null>(null)
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(editor)dialog.current?.showModal();else dialog.current?.close()},[editor])
 const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const edit=(node:PlanNode)=>{setEditor({node,level:node.level});setDraft(node.title);setMessage('')}
 const add=(l:number,parent?:PlanNode)=>{setEditor({level:l,parent,createId:crypto.randomUUID(),context:parent?parent.goal?parent.goal.context:parent.task?.context:area.area});setDraft('');setMessage('')}
 const link=(node:PlanNode)=>{setEditor({node,level:node.level,link:true});setDraft(node.parent??'');setMessage('')}
 const writeLock=useRef(false)
 const [undoLink,setUndoLink]=useState<{key:string;id:string;before:Partial<Task>;after:Partial<Task>}|null>(null)
 const connect=async(a:string,b:string)=>{
  if(writeLock.current||busy||editor)return
  const pair=connectionPair(nodes,a,b);if(!pair)return
  const {child,parent}=pair
  if(child.parent===parent.key)return
  writeLock.current=true;setBusy(true);setMessage('Saving connection…')
  const before=priorConnection(child),after=connectionPatch(child,parent)
  try{
   if(await updateTask(child.id,after)===false){setMessage('Could not save the connection. Try dragging again.');return}
   setUndoLink({key:child.key,id:child.id,before,after})
   setSelected(child.key);const p=new URLSearchParams(params);p.delete('focus');setParams(p,{replace:true})
   setMessage('Connected “'+child.title+'” to “'+parent.title+'”.');void refetch()
  }catch{setMessage('Could not save the connection. Try dragging again.')}finally{writeLock.current=false;setBusy(false)}
 }
 const undoConnection=async()=>{
  if(!undoLink||busy||writeLock.current)return
  const current=nodes.find(n=>n.key===undoLink.key)?.task
  const field='goalId' in undoLink.after?'goalId':'sourceId'
  if(!current||current[field]!==undoLink.after[field]){setUndoLink(null);setMessage('The connection has changed since this edit. Open the link picker to review it.');return}
  writeLock.current=true;setBusy(true)
  try{
   if(await updateTask(undoLink.id,undoLink.before)===false){setMessage('Could not undo. Try again.');return}
   setUndoLink(null);setMessage('Connection restored.');void refetch()
  }catch{setMessage('Could not undo. Try again.')}finally{writeLock.current=false;setBusy(false)}
 }
 const triage=async(action:()=>Promise<boolean|void>,success:string)=>{
  if(writeLock.current||busy||editor)return
  writeLock.current=true;setBusy(true);setMessage('Saving…')
  try{
   const ok=await action()
   if(ok===false){setMessage('No change was saved. You can try again.');return}
   setMessage(success);setUndoLink(null);void refetch()
  }catch{setMessage('Could not save this change. Please try again.')}finally{writeLock.current=false;setBusy(false)}
 }
 const triageMenu=(node:PlanNode)=>{
  const task=node.task
  const nextWeek=new Date(week);nextWeek.setDate(nextWeek.getDate()+7)
  const start=node.level===1?season.start:node.level===2?month.start:week
  const next=node.level===1?{seasonStart:season.next}:node.level===2?{monthStart:month.next}:{weekStart:nextWeek}
  const period=node.level===1?'season':node.level===2?'month':'week'
  return <TaskFateMenu label={'Triage '+node.title} disabled={busy||!!editor} showWhen={!!task}
   onOpen={task&&selection?()=>selection.setSelection({kind:'task',id:node.id}):()=>edit(node)}
   onPickWhen={when=>{if(task)void triage(()=>applyTriageWhen(when,node.id,{onPushTask:gated.pushTask,onSetBucket:gated.setBucket!,onFocus:(id,day)=>gated.updateTask(id,{plannedOn:day})}),describeTriageWhen(when))}}
   onPickDate={task?(date,isAllDay)=>{void triage(()=>gated.setBucket!(node.id,'timed',date,isAllDay),'Scheduled for '+date.toLocaleString())}:undefined}
   onComplete={task&&!task.completed?()=>{void triage(()=>toggleTask(node.id),'Marked complete.')}:undefined}
   onDelete={task?()=>{if(window.confirm('Delete “'+node.title+'”? This removes the item from all its planning periods.'))void triage(async()=>{await deleteTask(node.id)},'')}:undefined}
   extras={task?[
    ...(task.completed?[{label:'Reopen',onSelect:()=>{void triage(()=>toggleTask(node.id),'Reopened.')}}]:[]),
    {label:'Carry to next '+period,onSelect:()=>{void triage(async()=>!!await keepForward(node.id,next,start),'Carried to next '+period+'.')}},
    {label:'Remove from this '+period,onSelect:()=>{void triage(()=>dropCommitment(node.id,period,start),'Removed from this '+period+'.')}},
    {label:'Edit wording',onSelect:()=>edit(node)},
   ]:[
    {label:node.goal?.status==='completed'?'Reopen intention':'Complete intention',onSelect:()=>{void triage(()=>updateGoal(node.id,{status:node.goal?.status==='completed'?'active':'completed'}),'Intention updated.')}},
    {label:'Archive intention',onSelect:()=>{void triage(()=>updateGoal(node.id,{status:'archived'}),'Intention archived.')}},
   ]}/>
 }
 const save=async()=>{
  if(!editor||busy||(!editor.link&&!draft.trim()))return
  setBusy(true);setMessage('')
  try{
   let ok=false
   if(editor.link&&editor.node?.task){
    const node=editor.node
    const parents=nodes.filter(n=>n.level===node.level-1&&n.id!==node.id)
    const parent=parents.find(n=>n.key===draft)
    if(draft&&!parent){setMessage('That parent is no longer available. Choose another.');return}
    const updates=node.level===1?{goalId:parent?.id}:relinkUpdates(node.task!,parent?.id??null,node.level===2?MONTH_TO_SEASON:WEEK_TO_MONTH,new Set(parents.map(n=>n.id))).updates
    ok=(await updateTask(node.id,updates))!==false
   }else if(editor.node){ok=editor.level===0?(await updateGoal(editor.node.id,{name:draft.trim()}))!==false:(await updateTask(editor.node.id,{title:draft.trim()}))!==false}
   else if(editor.level===0){ok=!!await addGoal(null,draft.trim(),editor.context??undefined,{year:safeAnchor.getFullYear(),id:editor.createId})}
   else {
    const parent=editor.parent, context=editor.context
    ok=!!await addTask(draft.trim(),undefined,undefined,undefined,{
     id:editor.createId, bucket:editor.level===1?'quarter':editor.level===2?'month':'week',
     ...(editor.level===1?{seasonStart:season.start}:editor.level===2?{monthStart:month.start}:{weekStart:week}),
     context, ...(parent?editor.level===1?{goalId:parent.id}:{sourceId:parent.id,goalId:parent.task?.goalId}:{}),
    })
   }
   if(ok){setEditor(null);setDraft('');setMessage('Saved to your plan.');void refetch()}else setMessage('Could not save. Your wording is still here; try again.')
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
 return <main className="cp-page"><p className="cp-caption">YOUR PLANNING MAP</p><h1>{periodLabels[level]}</h1><p>Build each horizon across your plans. Select a card to focus on its branch. Show all plans to return to the full picture. Current filters apply.</p><div className="cp-nav"><label>Planning date <input type="date" value={localYmd(safeAnchor)} disabled={!!editor||busy} onChange={e=>{if(e.target.value){const p=new URLSearchParams(params);p.set('start',e.target.value);setParams(p);setSelected(null)}}}/></label>{tabs.map((t,i)=><button key={t} disabled={!!editor||busy} aria-current={level===i?'page':undefined} onClick={()=>{const p=new URLSearchParams(params);p.set('horizon',String(i));setParams(p);document.getElementById(`horizon-${i}`)?.scrollIntoView({block:'nearest',behavior:'smooth'})}}>{t}</button>)}<button onClick={()=>navigate('/today?view=alongside')} disabled={!!editor||busy}>Today →</button></div>
 <label className="hz-completed-toggle"><input type="checkbox" checked={showCompleted} onChange={e=>setShowCompleted(e.target.checked)} disabled={!!editor||busy}/> Show completed{completedCount>0?` (${completedCount})`:''}</label>
 {(loading||goalsLoading)&&<p role="status">Loading your plans…</p>}{(error||goalsError)?<p role="alert">Plans could not load. <button onClick={()=>{if(goalsError)window.location.reload();else void refetch()}}>Retry</button></p>:<> {focus&&<section ref={savedHeading} className="hz-detail" aria-label="Selected plan item"><div><small>{terms[focus.level]} · {periodLabels[focus.level]}</small><h2>{focus.title}</h2>{savedFocus===focus.key&&<><p className="hz-lineage">{nodes.filter(n=>related.has(n.key)&&n.level<focus.level).sort((a,b)=>a.level-b.level).map(n=>n.title).join(' → ')}</p><small className="hz-saved">Saved{focus.task?.scheduledFor?` · ${focus.task.scheduledFor.toLocaleDateString()}${!focus.task.isAllDay?' at '+focus.task.scheduledFor.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):''}`:' to your plan'}</small></>}</div><button className="cp-edit" disabled={!!editor||busy} onClick={()=>edit(focus)}>Edit<span className="sr-only"> {focus.title}</span></button>{focus.level>0&&!nodes.some(n=>n.level===focus.level-1&&n.id===focus.id)&&<button className="cp-edit" disabled={!!editor||busy} onClick={()=>link(focus)}>Link or change parent</button>}{focus.task&&selection&&<button className="cp-edit" onClick={()=>selection.setSelection({kind:'task',id:focus.id})}>Open details</button>}{focus.level<3?<button className="cp-add" disabled={!!editor||busy} onClick={()=>add(focus.level+1,focus)}>+ Add a {terms[focus.level+1]}</button>:<button className="cp-add" onClick={()=>navigate(`/week?view=alongside&start=${localYmd(week)}`)}>Schedule or complete in Week →</button>}</section>}{focus&&<div className="hz-focus-bar"><span role="status">Showing {shown.length} connected {shown.length===1?'item':'items'} · {nodes.length-shown.length} hidden</span><button type="button" disabled={!!editor||busy} onClick={clearFocus}>Show all plans</button></div>}<ConnectionCanvas nodes={nodes} selected={selected} disabled={!!editor||busy} onConnect={(a,b)=>{void connect(a,b)}} onPick={node=>{if(node.level===0){setSelected(node.key);setMessage('To connect an existing seasonal goal, select its card and choose Link or change parent.')}else if(nodes.some(n=>n.level===node.level-1&&n.id===node.id)){setMessage('This card is the same item in both periods; its shared connection stays intact.')}else link(node)}}>{({dragKey,targetKey,valid,port})=><div className={`hz-grid ${focus&&!dragKey?'is-focused':''}`}>{tabs.map((tab,i)=><section id={`horizon-${i}`} key={tab} className={`hz-zone hz-zone-${i} ${level===i?'hz-active':''}`} aria-label={`${tab} plans`}>
 <header><h2>{tab}</h2><p>{terms[i]}s · {periodLabels[i]}</p></header><div className="hz-column-body" role="region" aria-label={`${tab} cards`} tabIndex={0}>
 {(dragKey?nodes:shown).filter(n=>n.level===i).map(n=><div key={n.key} data-plan-key={n.key} className={`hz-card-wrap ${valid(n.key)?'hz-link-target':''} ${targetKey===n.key?'hz-link-over':''}`}><button className={`hz-item ${selected===n.key?'hz-selected':related.has(n.key)?'hz-related':''}`} aria-pressed={selected===n.key} disabled={!!editor||busy} onClick={()=>choose(n.key)}>
 <span>{n.title}</span>{savedFocus===n.key&&<small className="hz-saved" role="status">Saved to your plan</small>}<small>{n.parent?allNodes.find(p=>p.key===n.parent)?.title:'Independent '+terms[i]}</small>{(n.task?.completed||n.goal?.status==='completed')&&<small>Completed</small>}{n.task?.scheduledFor&&<small>Scheduled {n.task.scheduledFor.toLocaleDateString()}{!n.task.isAllDay&&` · ${n.task.scheduledFor.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`}</small>}
 </button><span className="hz-card-menu">{triageMenu(n)}</span>{port(n)}</div>)}
 {!shown.some(n=>n.level===i)&&!loading&&!goalsLoading&&<p className="cp-empty">{focus?'No connected items at this horizon.':'Nothing here for this period and filter yet.'}</p>}
 {!focus&&<button className="cp-add" disabled={!!editor||busy||loading||goalsLoading} onClick={()=>add(i)}>+ Add an independent {terms[i]}</button>}</div>
 </section>)}</div>}</ConnectionCanvas>

 <div className="cp-new">{area.picker}<span className="cp-caption">Life area for new independent entries</span></div></>}

 <dialog ref={dialog} className="cp-editor" aria-label="Plan wording" onCancel={e=>{if(busy)e.preventDefault();else setEditor(null)}} onClose={()=>{if(!busy)setEditor(null)}}>{editor&&<form aria-label={editor.node?'Edit plan item':'Add plan item'} onSubmit={e=>{e.preventDefault();void save()}}><h2>{editor.link?'Link':editor.node?'Edit':'Add'} {terms[editor.level]}</h2><p>{periodLabels[editor.level]}{editor.parent?` · Under ${editor.parent.title}`:''}</p>{editor.link?<><p>{editor.node?.title}</p><label>Connect to a {terms[editor.level-1]}<select autoFocus value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}><option value="">No parent — keep independent</option>{nodes.filter(n=>n.level===editor.level-1&&n.id!==editor.node?.id).map(n=><option key={n.key} value={n.key}>{n.title}</option>)}</select></label><p>Choices follow the planning date and your current filters. This changes the connection, not the schedule.</p></>:<label>Wording<input autoFocus value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/></label>}<button disabled={busy||(!editor.link&&!draft.trim())}>{busy?'Saving…':'Save'}</button><button type="button" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button><p role="status">{message}</p></form>}</dialog>
 {!editor&&<div className="hz-link-result"><p role="status">{message}</p>{undoLink&&<button disabled={busy} onClick={()=>{void undoConnection()}}>Undo connection</button>}</div>}</main>
}
export function ConstellationPage(){return <GoalsProvider><Inner/></GoalsProvider>}
