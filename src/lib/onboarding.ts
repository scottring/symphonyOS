import { supabase } from './supabase'
import { scopeForDomain } from './scope'
import { applyWeekStart, isWeekStart, localYmd, weekStartAnchor, type WeekStart } from './cadence/config'
import { normalizeSeasons, seasonStartFor } from './cadence/seasons'
import { withDayKeys } from './recurrenceDays'
import type { RecurrencePattern } from '@/types/actionable'
import { canFinishOnboarding, decodeOnboardingProgress, encodeOnboardingProgress, newOnboardingProgress, type OnboardingProgress } from './onboardingProgress'

export interface SetupMember { id: string; name: string; user_id: string; auth_user_id: string | null; is_full_user: boolean }
export interface SetupRoutine { id: string; name: string; recurrence_pattern: RecurrencePattern; time_of_day: string | null; assigned_to: string | null; description?:string|null; show_on_timeline?:boolean }
export interface SetupContext {
  household: { id: string; name: string; owner_id: string; week_starts_on: number; seasons: unknown } | null
  members: SetupMember[]
  routines: SetupRoutine[]
  progress: OnboardingProgress
  established: boolean
}
function check(error: {message: string} | null) { if (error) throw new Error(error.message) }

/** Stable per-user create keys survive a lost acknowledgement, refresh and a
 * second device. A retry reads the original row; it never overwrites an edit. */
export async function onboardingId(userId: string, purpose: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`symphony-onboarding-v1:${userId}:${purpose}`))).slice(0,16)
  bytes[6] = (bytes[6] & 15) | 80
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

export async function insertOnboardingOnce(table: 'routines' | 'tasks' | 'goals' | 'family_members', row: Record<string, unknown> & {id: string; user_id: string}): Promise<Record<string, unknown>> {
  const existing = await supabase.from(table).select('*').eq('id',row.id).maybeSingle()
  check(existing.error)
  if (existing.data) return existing.data
  const result = await supabase.from(table).insert(row).select('*').single()
  if (!result.error && result.data) return result.data
  // A transport failure can happen after a successful commit, not only 23505.
  const readback = await supabase.from(table).select('*').eq('id',row.id).maybeSingle()
  if (!readback.error && readback.data) return readback.data
  throw new Error('We could not confirm the save. Your entry is still here; retry will check for it before adding anything.')
}

export async function loadOnboarding(userId: string): Promise<SetupContext> {
  const [profile, houses, members, routines] = await Promise.all([
    supabase.from('user_profiles').select('onboarding_step,onboarding_completed_at').eq('user_id',userId).maybeSingle(),
    supabase.from('households').select('id,name,owner_id,week_starts_on,seasons').order('created_at').limit(1),
    supabase.from('family_members').select('id,name,user_id,auth_user_id,is_full_user').order('display_order'),
    supabase.from('routines').select('id,name,description,recurrence_pattern,time_of_day,assigned_to,show_on_timeline').eq('visibility','active').order('name'),
  ])
  for (const r of [profile,houses,members,routines]) check(r.error)
  return {
    household: houses.data?.[0] ?? null, members: members.data ?? [], routines: routines.data ?? [],
    progress: decodeOnboardingProgress(profile.data?.onboarding_step) ?? newOnboardingProgress(),
    established: !!profile.data?.onboarding_completed_at || (houses.data?.[0]?.owner_id !== userId && !!houses.data?.length),
  }
}

export async function saveOnboardingProgress(userId: string, progress: OnboardingProgress): Promise<void> {
  if (progress.finished && !canFinishOnboarding(progress)) throw new Error('Review each setup step or choose Later before finishing.')
  const marker = encodeOnboardingProgress(progress)
  const result = await supabase.from('user_profiles').upsert({user_id:userId, onboarding_step:marker,
    ...(progress.finished ? {onboarding_completed_at:new Date().toISOString()} : {}), updated_at:new Date().toISOString()}, {onConflict:'user_id'})
    .select('onboarding_step').single()
  check(result.error)
  if (result.data?.onboarding_step !== marker) throw new Error('Your progress could not be confirmed. Please try again.')
}

/** Use the same owner-authorized, transactional change as Settings. A retry
 * after a lost response is safe: the RPC is a no-op for the current day. */
export async function saveOnboardingWeekStart(day: WeekStart): Promise<void> {
  if(!isWeekStart(day))throw new Error('Choose Sunday, Monday or Saturday for the start of your week.')
  const {data,error}=await supabase.rpc('set_household_week_start',{p_start:day})
  check(error)
  if(typeof data!=='number')throw new Error('Your week start could not be confirmed. Please try again.')
  applyWeekStart(day)
}

export interface RoutineSetupInput { name: string; recurrence: RecurrencePattern; time: string; assignees: string[]; context: 'family' | 'personal'; description?:string; showOnTimeline?:boolean }
export async function saveOnboardingRoutine(userId: string, input: RoutineSetupInput, members: SetupMember[] = [], purpose = 'routine'): Promise<SetupRoutine> {
  if (!input.name.trim()) throw new Error('Give the routine a name.')
  const row = withDayKeys({id:await onboardingId(userId,purpose), user_id:userId, name:input.name.trim(),
    recurrence_pattern:input.recurrence, time_of_day:input.time || null,
    ...(input.description ? {description:input.description} : {}),
    assigned_to:input.assignees[0] ?? null, assigned_to_all:input.assignees, default_assignee:null,
    context:input.context, scope:scopeForDomain(input.context,input.assignees,members.find(m=>m.auth_user_id===userId || (m.user_id===userId && !m.auth_user_id && m.is_full_user))?.id), visibility:'active', show_on_timeline:input.showOnTimeline ?? true,
  })
  return await insertOnboardingOnce('routines',row) as unknown as SetupRoutine
}

export type FirstItemPlace = 'inbox' | 'week' | 'today' | 'year' | 'season' | 'month'
export async function saveOnboardingItem(userId: string, title: string, place: FirstItemPlace, context: SetupContext, now = new Date(), purpose: 'first-item'|'first-goal' = 'first-item') {
  if (!title.trim()) throw new Error('Write something you want to capture.')
  // One slot across all horizons prevents an uncertain save followed by a
  // changed choice from creating a goal AND a task.
  const id = await onboardingId(userId,purpose)
  const [task, goal] = await Promise.all([
    supabase.from('tasks').select('*').eq('id',id).maybeSingle(),
    supabase.from('goals').select('*').eq('id',id).maybeSingle(),
  ])
  check(task.error); check(goal.error)
  if (task.data) return itemReceipt(task.data,'tasks')
  if (goal.data) return itemReceipt(goal.data,'goals')
  if (place === 'year') {
    const row = await insertOnboardingOnce('goals',{id,user_id:userId,name:title.trim(),year:now.getFullYear(),area_id:null,context:'personal',scope:scopeForDomain('personal',[],null),status:'active',sort_order:0})
    return itemReceipt(row,'goals')
  }
  const bucket = ({inbox:'inbox',week:'week',today:'timed',month:'month',season:'quarter'})[place]
  const row = await insertOnboardingOnce('tasks',{id,user_id:userId,title:title.trim(),bucket,completed:false,context:'personal',scope:scopeForDomain('personal',[],null),
    category:'task',is_goal:place==='month'||place==='season',
    scheduled_for:place==='today' ? new Date(now.getFullYear(),now.getMonth(),now.getDate(),12).toISOString() : null,
    is_all_day:place==='today' ? true : null,
    week_start:place==='week' ? localYmd(weekStartAnchor(now,([0,1,6].includes(context.household?.week_starts_on ?? -1) ? context.household!.week_starts_on : 0) as 0|1|6)) : null,
    month_start:place==='month' ? localYmd(new Date(now.getFullYear(),now.getMonth(),1)) : null,
    season_start:place==='season' ? localYmd(seasonStartFor(now,normalizeSeasons(context.household?.seasons))) : null,
  })
  return itemReceipt(row,'tasks')
}
function itemReceipt(row: Record<string,unknown>, table: 'tasks'|'goals') {
  const destination: FirstItemPlace = table==='goals' ? 'year' : row.is_goal && row.bucket==='quarter' ? 'season' : row.is_goal && row.bucket==='month' ? 'month' : row.bucket==='week' ? 'week' : row.bucket==='timed' ? 'today' : 'inbox'
  return {id:String(row.id),title:String(row.title ?? row.name),destination}
}
