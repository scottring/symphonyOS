import { useRef, useState, useMemo, type ReactNode } from 'react'
import type { Task } from '@/types/task'
import { useDomain } from '@/hooks/useDomain'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { filterTasksForLayers } from '@/lib/today/domainFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'
import { weekListTasks } from '@/lib/planning/weekList'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { lineDropUpdates } from '@/lib/planning/v2/planV2'
import { parentOf, WEEK_TO_MONTH } from '@/lib/planning/journalGroups'
import { useSideColumnSlot } from '@/shell/SideColumn'
import { AlongsideContext } from './AlongsideContext'
import './alongside.css'

export function AlongsideDay({children,tasks,date,update,loading,error,retry,weekView=false,onSelect}:{children:ReactNode;tasks:Task[];date:Date;update:(id:string,patch:Partial<Task>)=>Promise<boolean|void>;loading:boolean;error:boolean;retry:()=>void;weekView?:boolean;onSelect?:(id:string)=>void}){
 const {layers}=useDomain(),[people]=useAssigneeFilter(),{getCurrentUserMember}=useFamilyMembers()
 const [open,setOpen]=useState(()=>!window.matchMedia('(max-width:700px)').matches),[pending,setPending]=useState<string|null>(null),[message,setMessage]=useState('')
 const companion=useSideColumnSlot()
 const showChoices=open&&!companion.open
 const workspaceControls=useMemo(()=>weekView?null:{showWeek:()=>setOpen(true)},[weekView])
 const lock=useRef(false)
 const week=weekStartAnchor(date,readCadenceConfig().weekStartsOn)
 const lens=planPeopleLens(people,getCurrentUserMember()?.id??null)
 const visible=filterTasksForLayers(tasks,layers).filter(lens.keep)
 const ids=new Set(visible.map(t=>t.id))
 const candidates=weekListTasks(visible,week,lens.scopeId,{isCurrent:localYmd(week)===localYmd(weekStartAnchor(new Date(),readCadenceConfig().weekStartsOn))}).filter(t=>!t.completed&&(!t.scheduledFor||localYmd(t.scheduledFor)!==localYmd(date)))
 const dayLabel=date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})
 const place=async(id:string)=>{
  const task=candidates.find(t=>t.id===id)
  if(!task||lock.current)return
  lock.current=true;setPending(id);setMessage('')
  try{const ok=await update(id,lineDropUpdates(task,{kind:'day',at:date}));setMessage(ok===false?'Could not place this action. It remains available; try again.':`Planned “${task.title}” for ${dayLabel}.`)}catch{setMessage('Could not place this action. Please try again.')}finally{lock.current=false;setPending(null)}
 }
 return <AlongsideContext.Provider value={workspaceControls}><section className="ad-shell">{!weekView&&<div className="ad-nav" role="group" aria-label="Today view"><button aria-expanded={showChoices} disabled={!!companion.open} aria-controls="ad-week" onClick={()=>setOpen(v=>!v)}>{companion.open?'Weekly choices return when details close':open?'Hide this week':'Show this week'}</button></div>}<p role="status" className="ad-status">{message}</p><div className={`ad-layout ${showChoices&&!weekView?'ad-open':''}`}><div className="ad-day" onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-symphony-week-action'))e.preventDefault()}} onDropCapture={e=>{const id=e.dataTransfer.getData('application/x-symphony-week-action');if(id){e.preventDefault();e.stopPropagation();void place(id)}}}>{children}</div>{!weekView&&<aside id="ad-week" hidden={!showChoices}><h2>This week</h2><p>Drag an action onto the day, or choose “Plan for {dayLabel}.” Its connections stay with it.</p>{loading?<p>Loading weekly actions…</p>:error?<p role="alert">Could not load this week. <button onClick={retry}>Retry</button></p>:<>{candidates.map(task=>{const parent=parentOf(task,WEEK_TO_MONTH,ids);return <article key={task.id} draggable={!pending} onDragStart={e=>{e.dataTransfer.setData('application/x-symphony-week-action',task.id);e.dataTransfer.effectAllowed='move'}}><h3>{onSelect?<button className="ad-title" onClick={()=>onSelect(task.id)}>{task.title}</button>:task.title}</h3>{parent&&<small>↳ {visible.find(t=>t.id===parent.id)?.title}</small>}{task.scheduledFor&&<small>Currently {task.scheduledFor.toLocaleDateString(undefined,{month:'short',day:'numeric'})}{!task.isAllDay&&` at ${task.scheduledFor.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`}</small>}<button disabled={!!pending} onClick={()=>void place(task.id)}>{pending===task.id?'Saving…':`Plan for ${dayLabel}`}</button></article>})}{!candidates.length&&<p>No other open actions for this week in the current filters.</p>}</>}</aside>}</div></section></AlongsideContext.Provider>
}
