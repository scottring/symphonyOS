import type { Task } from '@/types/task'
import type { PlanNode } from './model'
import { relinkUpdates, MONTH_TO_SEASON, WEEK_TO_MONTH, type LinkField } from '@/lib/planning/journalGroups'

/** A link only ever joins adjacent, visible horizons. */
export function connectionPair(nodes: PlanNode[], a: string, b: string) {
 const first=nodes.find(n=>n.key===a),second=nodes.find(n=>n.key===b)
 if(!first||!second||Math.abs(first.level-second.level)!==1||first.id===second.id)return null
 const child=first.level>second.level?first:second,parent=child===first?second:first
 if(!child.task||nodes.some(n=>n.level===child.level-1&&n.id===child.id))return null
 // A record may have multiple period appearances. Do not create a record-level cycle.
 let ancestor:PlanNode|undefined=parent
 const seen=new Set<string>()
 while(ancestor&&!seen.has(ancestor.key)){
  if(ancestor.id===child.id)return null
  seen.add(ancestor.key);ancestor=nodes.find(n=>n.key===ancestor?.parent)
 }
 return {child,parent}
}

/** The parents a child may be moved under: the visible items one horizon up. */
export function eligibleParents(nodes: PlanNode[], child: PlanNode): PlanNode[] {
 return nodes.filter(n=>n.level===child.level-1&&!!connectionPair(nodes,child.key,n.key))
}

type LinkPatch = Partial<Pick<Task, LinkField | 'goalId'>>

/**
 * The write that puts `child` under `parent` (or under no parent), and the
 * write that undoes it. Null when nothing would change.
 *
 * - A seasonal goal names its yearly intention in goal_id.
 * - A monthly milestone or weekly action names its parent in source_id. Older
 *   rows may also carry the parent in a legacy field (goal_task_id, or
 *   supports_goal_task_id for a month); a legacy field that still names the
 *   old parent is cleared so the item cannot drift back under it.
 * - goal_id (the yearly intention) follows the new parent's, so the item and
 *   its parent agree on which intention they serve. Unlinking leaves it.
 *
 * `nodes` are the visible plan items: a parent the reader cannot see is never
 * named or cleared.
 */
export function moveUnderPatch(nodes: PlanNode[], child: PlanNode, parent: PlanNode | null): { after: LinkPatch; before: LinkPatch } | null {
 const task=child.task
 if(!task||child.level<1)return null
 const after:LinkPatch={}
 if(child.level===1){
  after.goalId=parent?.id
 }else{
  const rule=child.level===2?MONTH_TO_SEASON:WEEK_TO_MONTH
  const visible=new Set(nodes.filter(n=>n.level===child.level-1&&n.id!==child.id).map(n=>n.id))
  if(parent){
   after.sourceId=parent.id
   const old=child.parent?nodes.find(n=>n.key===child.parent)?.id:undefined
   for(const field of rule.fields){
    if(field!=='sourceId'&&old&&old!==parent.id&&task[field]===old)after[field]=undefined
   }
   const goalId=parent.task?.goalId
   if(goalId!==task.goalId)after.goalId=goalId
  }else{
   // Clear every field that shows a visible parent, until none does.
   let current:Task={...task}
   for(let i=0;i<rule.fields.length;i++){
    const {updates,revealed}=relinkUpdates(current,null,rule,visible)
    Object.assign(after,updates);current={...current,...updates}
    if(!revealed)break
   }
  }
 }
 const keys=(Object.keys(after) as (keyof LinkPatch)[]).filter(k=>after[k]!==task[k])
 if(!keys.length)return null
 const changed:LinkPatch={},before:LinkPatch={}
 for(const k of keys){changed[k]=after[k];before[k]=task[k]}
 return {after:changed,before}
}
