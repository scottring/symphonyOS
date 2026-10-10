import type { Task } from '@/types/task'
import type { PlanNode } from './model'

/** Drag in either direction, but only between adjacent, visible horizons. */
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
export function connectionPatch(child:PlanNode,parent:PlanNode):Partial<Task>{
 return child.level===1?{goalId:parent.id}:{sourceId:parent.id}
}
export function priorConnection(child:PlanNode):Partial<Task>{
 return child.level===1?{goalId:child.task?.goalId}:{sourceId:child.task?.sourceId}
}
