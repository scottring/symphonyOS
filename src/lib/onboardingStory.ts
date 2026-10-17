import type { ChangeSet } from './canvas/changeCard'
import { saveOnboardingRoutine, type SetupMember } from './onboarding'
import { supabase } from './supabase'

/** Recheck both model output and restored local drafts before showing or saving. */
export function isRoutineStoryDraft(value: unknown): value is ChangeSet {
  if (!value || typeof value !== 'object') return false
  const set = value as ChangeSet
  return typeof set.key === 'string' && !!set.key && typeof set.title === 'string'
    && Array.isArray(set.ops) && set.ops.length > 0 && set.ops.length <= 30
    && new Set(set.ops.map(op => op?.key)).size === set.ops.length
    && new Set(set.ops.filter(op=>op?.routineId).map(op=>op.routineId)).size === set.ops.filter(op=>op?.routineId).length
    && set.ops.every(op => op && typeof op.key === 'string' && !!op.key
      && typeof op.title === 'string' && !!op.title.trim()
      && (op.op === 'routine_change'
        ? typeof op.routineId === 'string' && !!op.routineId && typeof op.seen === 'string' && !!op.seen
          && typeof op.showOnTimeline === 'boolean'
          && [op.name,op.time,op.clearTime,op.days,op.assignees,op.context,op.note].every(v=>v===undefined)
        : op.op === 'routine_add'
      && Array.isArray(op.days) && op.days.every(day => ['sun','mon','tue','wed','thu','fri','sat'].includes(day))
      && (op.time === undefined || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(op.time))
      && (op.note === undefined || (typeof op.note === 'string' && op.note.length <= 1000))
      && (op.showOnTimeline === undefined || typeof op.showOnTimeline === 'boolean')
      && (op.context === undefined || ['family','personal'].includes(op.context))
      && (op.assignees === undefined || (Array.isArray(op.assignees) && op.assignees.every(id => typeof id === 'string')))))
}

async function saveDisplayChoice(id:string,show:boolean,seen:string) {
  const read=()=>supabase.from('routines').select('*').eq('id',id).maybeSingle()
  const before=await read()
  if(before.error || !before.data) throw new Error('Could not read this routine.')
  // A previous attempt may have committed before the acknowledgement was lost.
  if(before.data.show_on_timeline===show) return before.data
  if(before.data.updated_at!==seen) {
    const error=new Error('This routine changed while you were reviewing it. Ask Symphony to prepare that display choice again; your draft is still here.')
    error.name='RoutineDraftChanged';throw error
  }
  const saved=await supabase.from('routines').update({show_on_timeline:show}).eq('id',id).eq('updated_at',seen).select('*').maybeSingle()
  if(!saved.error && saved.data) return saved.data
  const after=await read()
  if(!after.error && after.data?.show_on_timeline===show) return after.data
  throw new Error('Could not confirm this display choice.')
}

/** Only the review button calls this. Stable keys make a partial save retry safe. */
export async function saveRoutineStory(userId: string, set: ChangeSet, members: SetupMember[]) {
  if (!isRoutineStoryDraft(set) || set.ops.some(op => op.assignees?.some(id => !members.some(m => m.id === id)))) {
    throw new Error('This draft needs another look. Tell Symphony what should change before saving.')
  }
  const saved = []
  for (const op of set.ops) {
    if(op.op==='routine_change') {
      saved.push(await saveDisplayChoice(op.routineId!,op.showOnTimeline!,op.seen!))
      continue
    }
    saved.push(await saveOnboardingRoutine(userId, {
      name:op.title, recurrence:{type:'weekly',days:op.days!}, time:op.time ?? '',
      assignees:op.assignees ?? [], context:op.context === 'personal'?'personal':'family',
      description:op.note,
      showOnTimeline:op.showOnTimeline,
    }, members, `story:${set.key}:${op.key}`))
  }
  return saved
}
