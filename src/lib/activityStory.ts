import type { ChangeCardNote, ChangeOp, ChangeSet } from './canvas/changeCard'
import { insertOnboardingOnce, onboardingId, type FirstItemPlace, type SetupContext } from './onboarding'
import { memberForAuthUser, scopeForDomain } from './scope'
import { localYmd, weekStartAnchor } from './cadence/config'
import { normalizeSeasons, seasonLabel, seasonStartFor } from './cadence/seasons'
import { supabase } from './supabase'

const day = (s: string) => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d,12) }
export const isActivityDate = (s: unknown): s is string => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && localYmd(day(s))===s
const optionalString = (s: unknown) => s===undefined || (typeof s==='string' && !!s.trim())
export function isActivityStoryDraft(value: unknown): value is ChangeSet {
  if (!value || typeof value!=='object') return false
  const s=value as ChangeSet
  return typeof s.key==='string' && !!s.key && typeof s.title==='string' && Array.isArray(s.ops) && s.ops.length>0 && s.ops.length<=30
    && new Set(s.ops.map(o=>o?.key)).size===s.ops.length
    && s.ops.every(o=>o && typeof o.key==='string' && !!o.key && typeof o.title==='string' && !!o.title.trim() && o.title.length<=300
      && (o.context===undefined || ['personal','family','work'].includes(o.context))
      && (o.note===undefined || typeof o.note==='string' && o.note.length<=1000)
      && [o.assignee,o.goalId,o.parentId].every(optionalString)
      && (o.op==='add'
        ? o.level===undefined && o.parentId===undefined && o.periodStart===undefined && ['inbox','week','day'].includes(o.capturePlacement??'')
          && (o.capturePlacement==='day' ? isActivityDate(o.date) && (o.time===undefined || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(o.time)) : o.date===undefined && o.time===undefined)
          && (o.capturePlacement==='week' ? isActivityDate(o.captureWeekStart) : o.captureWeekStart===undefined)
        : o.op==='plan_add' && ['year','season','month'].includes(o.level??'') && isActivityDate(o.periodStart)
          && [o.capturePlacement,o.captureWeekStart,o.date,o.time,o.assignee,o.goalId].every(v=>v===undefined)
          && (o.level!=='year' || !o.parentId)))
}
export function activityWhere(o: ChangeOp): string {
  if(o.op==='plan_add') {
    const date=day(o.periodStart!)
    const period=o.periodLabel??(o.level==='year'?String(date.getFullYear()):date.toLocaleDateString(undefined,{month:'long',year:'numeric'}))
    return `${o.level==='season'?'Quarter':o.level==='year'?'Year':'Month'} · ${period}`
  }
  if(o.capturePlacement==='inbox') return 'Inbox · decide when later'
  if(o.capturePlacement==='week') return `Week of ${day(o.captureWeekStart!).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · no day yet`
  return `${day(o.date!).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})} · ${o.time??'any time'}`
}
export function activityStoryNote(s:ChangeSet,state:ChangeCardNote['state']):ChangeCardNote {
  return {state,title:s.title,at:new Date().toISOString(),ops:s.ops.map(o=>({op:o.op,title:o.title,where:activityWhere(o),date:o.date,time:o.time})),
    // Keep every pending field through a correction, including audience and notes.
    draft: state==='pending'?s:undefined}
}
export interface ActivityReceipt { id:string; title:string; destination:FirstItemPlace; where:string; start?:string }

/** Preflight the whole draft before any insert. Every retry uses the same IDs. */
export async function saveActivityStory(userId:string,s:ChangeSet,context:SetupContext):Promise<ActivityReceipt[]> {
  if(!isActivityStoryDraft(s)) throw new Error('This draft needs another look before saving.')
  const self=memberForAuthUser(context.members,userId)?.id
  const rows: {table:'tasks'|'goals';row:Record<string,unknown>&{id:string;user_id:string};op:ChangeOp}[]=[]
  try { for(const o of s.ops) {
    if(o.assignee && !context.members.some(m=>m.id===o.assignee)) throw new Error('That person is no longer in this household. Ask Symphony to update the draft.')
    if(o.captureWeekStart && localYmd(weekStartAnchor(day(o.captureWeekStart),([0,1,6].includes(context.household?.week_starts_on??-1)?context.household!.week_starts_on:0) as 0|1|6))!==o.captureWeekStart) throw new Error('The week has changed. Ask Symphony to check its starting date.')
    if(o.op==='plan_add') {
      const date=day(o.periodStart!)
      const expected=o.level==='year'?`${date.getFullYear()}-01-01`:o.level==='month'?localYmd(new Date(date.getFullYear(),date.getMonth(),1)):localYmd(seasonStartFor(date,normalizeSeasons(context.household?.seasons)))
      if(expected!==o.periodStart) throw new Error('Ask Symphony to check the goal’s planning period.')
    }
    const parentId=o.parentId??o.goalId
    let parent:Record<string,unknown>|null=null
    if(parentId) {
      const table=o.level==='season'?'goals':'tasks'
      const result=await supabase.from(table).select('*').eq('id',parentId).maybeSingle()
      parent=result.data
      if(result.error || !parent || table==='tasks' && (!parent.is_goal || parent.bucket!==(o.op==='add'?'month':'quarter')) || table==='goals' && parent.status!=='active') throw new Error('The supporting goal is no longer available. Ask Symphony to check the connection.')
      if(parent.context && parent.context!==(o.context??'personal')) throw new Error('This connection crosses personal and shared activities. Ask Symphony to confirm the life area first.')
    }
    const base={id:await onboardingId(userId,`activities:${s.key}:${o.key}`),user_id:userId,context:o.context??'personal',scope:scopeForDomain(o.context??'personal',o.assignee?[o.assignee]:[],self)}
    if(o.level==='year') rows.push({table:'goals',op:o,row:{...base,name:o.title,year:day(o.periodStart!).getFullYear(),area_id:null,status:'active',sort_order:0,notes:o.note??null}})
    else {
      const bucket=o.level==='season'?'quarter':o.level==='month'?'month':o.capturePlacement==='day'?'timed':o.capturePlacement==='week'?'week':'inbox'
      const scheduled=o.date?day(o.date):null
      if(scheduled && o.time) {const [h,m]=o.time.split(':').map(Number);scheduled.setHours(h,m,0,0);if(scheduled.getHours()!==h||scheduled.getMinutes()!==m)throw new Error('That time is unavailable because the clocks change. Choose another time.')}
      rows.push({table:'tasks',op:o,row:{...base,title:o.title,bucket,completed:false,category:'task',is_goal:o.op==='plan_add',notes:o.note??null,
        assigned_to:o.assignee??null,assigned_to_all:o.assignee?[o.assignee]:[],scheduled_for:scheduled?.toISOString()??null,is_all_day:scheduled?!o.time:null,
        week_start:o.captureWeekStart??null,month_start:o.level==='month'?o.periodStart:null,season_start:o.level==='season'?o.periodStart:null,
        source_id:o.level==='month'?o.parentId??null:o.goalId??null,goal_id:o.level==='season'?o.parentId??null:parent?.goal_id??null}})
    }
  } } catch(error) {const failure=error instanceof Error?error:new Error('Could not check this draft.');failure.name='ActivityDraftInvalid';throw failure}
  const receipts:ActivityReceipt[]=[]
  for(const {table,row,op} of rows) {
    const saved=await insertOnboardingOnce(table,row)
    // Read back actual placement, including a subsequent edit. Retry never
    // overwrites an item just to make it match an older draft.
    const actual={...op,title:String(saved.title??saved.name)}
    const destination:FirstItemPlace=table==='goals'?'year':saved.is_goal&&saved.bucket==='quarter'?'season':saved.is_goal&&saved.bucket==='month'?'month':saved.bucket==='timed'?'today':saved.bucket==='week'?'week':'inbox'
    const start=destination==='year'?`${saved.year}-01-01`:destination==='season'?String(saved.season_start):destination==='month'?String(saved.month_start):destination==='week'?String(saved.week_start):destination==='today'&&saved.scheduled_for?localYmd(new Date(String(saved.scheduled_for))):undefined
    if(table==='goals'||saved.is_goal){actual.level=destination as 'year'|'season'|'month';actual.periodStart=start;actual.periodLabel=destination==='season'?seasonLabel(day(start!),normalizeSeasons(context.household?.seasons)):undefined}
    else {actual.capturePlacement=destination==='today'?'day':destination==='week'?'week':'inbox';actual.captureWeekStart=destination==='week'?start:undefined;actual.date=destination==='today'?start:undefined;actual.time=destination==='today'&&!saved.is_all_day?new Date(String(saved.scheduled_for)).toTimeString().slice(0,5):undefined}
    receipts.push({id:String(saved.id),title:actual.title,destination,where:activityWhere(actual),start})
  }
  return receipts
}
