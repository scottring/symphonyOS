import type { Goal } from '@/types/goal'
import type { Task } from '@/types/task'
import { parentOf, MONTH_TO_SEASON, WEEK_TO_MONTH } from '@/lib/planning/journalGroups'
export interface PlanNode { key: string; id: string; title: string; level: number; parent: string | null; task?: Task; goal?: Goal }
// Inputs must already be filtered by authorization, life area and people.
// One record can belong to several periods: keys identify appearances, not copies.
export function planNodes(goals: Goal[], periods: Task[][]): PlanNode[] {
 const out: PlanNode[] = goals.map(goal=>({key:`0:${goal.id}`,id:goal.id,title:goal.name,level:0,parent:null,goal}))
 periods.forEach((rows,index)=>{
  const level=index+1, parents=out.filter(n=>n.level===level-1), ids=new Set(parents.map(n=>n.id))
  rows.forEach(task=>{
   const parentId=level===1?(task.goalId&&ids.has(task.goalId)?task.goalId:null):ids.has(task.id)?task.id:parentOf(task,level===2?MONTH_TO_SEASON:WEEK_TO_MONTH,ids)?.id
   out.push({key:`${level}:${task.id}`,id:task.id,title:task.title,level,parent:parentId?`${level-1}:${parentId}`:null,task})
  })
 })
 return out
}

/** Keep the selected appearance, its ancestors and every descendant; never siblings. */
export function branchKeys(nodes: PlanNode[], selected: string | null): Set<string> {
 const keys = new Set<string>()
 const node = nodes.find(n => n.key === selected)
 if (!node) return keys
 keys.add(node.key)
 let parent = nodes.find(n => n.key === node.parent)
 while (parent && !keys.has(parent.key)) {
  keys.add(parent.key)
  parent = nodes.find(n => n.key === parent?.parent)
 }
 const visit = (key: string) => {
  for (const child of nodes.filter(n => n.parent === key)) {
   if (!keys.has(child.key)) { keys.add(child.key); visit(child.key) }
  }
 }
 visit(node.key)
 return keys
}
