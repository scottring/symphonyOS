import { periodBounds } from '@/lib/planning/periodPage'
import { readSeasons } from '@/lib/cadence/seasons'
import type { Goal } from '@/types/goal'
import type { Task } from '@/types/task'
import type { Layer } from '@/lib/domains'
import { filterTasksForLayers } from '@/lib/today/domainFilter'
import { localYmd, readCadenceConfig, weekStartAnchor } from '@/lib/cadence/config'
import { weekListTasks } from '@/lib/planning/weekList'
export const WORKSPACE_PAGES = ['today','week','month','season','year','inbox','routines','meals'] as const
export type WorkspacePage = typeof WORKSPACE_PAGES[number]
export interface WorkspaceContext {
  page: string; date: string; layers: string[]; selectedId: string | null
  items: {id:string;title:string;context:string|null;scheduledFor:string|null;completed:boolean;bucket:string|null;sourceId:string|null;goalId:string|null;periods:{level:string;start:string}[]}[]
  periodStarts?: {year:string;season:string;month:string;week:string}
  intentions?: {id:string;title:string;year:number}[]
  truncated: boolean
  /** What this page is for (src/lib/explain/pageGuides.ts), added when a turn is sent. */
  guide?: string
  /** Regions on screen that Symphony may point at, read when a turn is sent. */
  targets?: {id:string;label:string}[]
  /** The page's period against today: looking back, at now, or ahead. */
  viewing?: 'past' | 'current' | 'future'
}
/** Where the shown period sits against today's, for the planning pages. */
function viewingOf(page:string, date:Date, now:Date):WorkspaceContext['viewing'] {
  const startOf=(d:Date):string|null=>page==='today'?localYmd(d)
    :page==='week'?localYmd(weekStartAnchor(d,readCadenceConfig().weekStartsOn))
    :page==='month'?localYmd(new Date(d.getFullYear(),d.getMonth(),1))
    :page==='season'?localYmd(periodBounds('season',d,readSeasons()).start)
    :page==='year'?String(d.getFullYear()):null
  const shown=startOf(date), current=startOf(now)
  if(shown===null||current===null)return undefined
  return shown===current?'current':shown<current?'past':'future'
}
export function workspaceContext(tasks:Task[], pathname:string, search:string, layers:ReadonlySet<Layer>, selectedId:string|null, now=new Date(), goals:Goal[]=[]):WorkspaceContext {
  const params=new URLSearchParams(search)
  const raw=params.get('date')??params.get('start')
  const parsed=raw&&/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(`${raw}T12:00:00`):now
  const date=Number.isNaN(parsed.getTime())?now:parsed
  // The Plan canvas switches Year/Season/Month with `horizon` and keeps the
  // path it was opened on (/month?view=constellation&horizon=0 shows Year),
  // so the horizon, when present, is the page the person is looking at.
  const horizon=params.get('view')==='constellation'?params.get('horizon'):null
  const page=horizon!==null&&/^[0-2]$/.test(horizon)?['year','season','month'][Number(horizon)]:pathname.split('/')[1]||'today'
  const visible=filterTasksForLayers(tasks,layers)
  const week=weekStartAnchor(date,readCadenceConfig().weekStartsOn)
  const weekly=weekListTasks(visible,week,null,{isCurrent:localYmd(week)===localYmd(weekStartAnchor(now,readCadenceConfig().weekStartsOn))})
  const candidates=page==='today'||page==='week'?visible.filter(t=>weekly.some(w=>w.id===t.id)||t.id===selectedId||(t.scheduledFor&&localYmd(t.scheduledFor)===localYmd(date))):visible.filter(t=>t.id===selectedId||!t.completed)
  const ordered=[...candidates].sort((a,b)=>Number(b.id===selectedId)-Number(a.id===selectedId))
  return {viewing:viewingOf(page,date,now),periodStarts:{year:localYmd(new Date(date.getFullYear(),0,1)),season:localYmd(periodBounds('season',date,readSeasons()).start),month:localYmd(new Date(date.getFullYear(),date.getMonth(),1)),week:localYmd(week)},intentions:goals.filter(g=>g.year===date.getFullYear()&&g.status!=='archived'&&layers.has(g.context??'unsorted')).slice(0,30).map(g=>({id:g.id,title:g.name,year:g.year})),page,date:localYmd(date),layers:[...layers],selectedId:visible.some(t=>t.id===selectedId)?selectedId:null,items:ordered.slice(0,60).map(t=>({id:t.id,title:t.title,context:t.context??null,scheduledFor:t.scheduledFor?localYmd(t.scheduledFor):null,completed:t.completed,bucket:t.bucket??null,sourceId:t.sourceId&&visible.some(v=>v.id===t.sourceId)?t.sourceId:null,goalId:goals.some(g=>g.id===t.goalId&&layers.has(g.context??'unsorted'))?t.goalId??null:null,periods:(t.commitments??[]).filter(c=>c.status==='open').map(c=>({level:c.level,start:localYmd(c.periodStart)}))})),truncated:ordered.length>60}
}
export function workspaceDestination(page:unknown,date?:unknown):string|null {
  if(typeof page!=='string'||!WORKSPACE_PAGES.includes(page as WorkspacePage))return null
  if(date!==undefined&&(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(`${date}T12:00:00`).getTime())||localYmd(new Date(`${date}T12:00:00`))!==date))return null
  const params=new URLSearchParams()
  if(['today','week'].includes(page))params.set('view','alongside')
  else if(['year','season','month'].includes(page)){params.set('view','constellation');params.set('horizon',String(['year','season','month'].indexOf(page)))}
  else params.set('workspace','1')
  if(typeof date==='string')params.set(['year','season','month'].includes(page)?'start':'date',date)
  return `/${page}?${params}`
}
