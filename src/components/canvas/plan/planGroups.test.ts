import {describe,it,expect} from 'vitest'
import {horizonGroups,focusedGroupKeys,childCount,UNLINKED,INTENTIONS} from './planGroups'
import {planNodes} from '@/components/plan/constellation/model'
import type {Task} from '@/types/task'
import type {Goal} from '@/types/goal'
const task=(id:string,rest:Partial<Task>={})=>({id,title:id,...rest} as Task)
const goals=[{id:'g',name:'Together',status:'active'} as Goal,{id:'h',name:'Health',status:'completed'} as Goal]
const nodes=planNodes(goals,[[task('a',{goalId:'g'}),task('b',{goalId:'g'}),task('c'),task('d',{goalId:'g',completed:true})],[task('m',{sourceId:'a'})],[]])
describe('horizonGroups',()=>{
 it('groups a horizon under its parents with Unlinked last, hiding finished parents without open work',()=>{
  const {groups,doneCount}=horizonGroups(nodes,1,false)
  expect(groups.map(g=>g.key)).toEqual(['0:g',UNLINKED])
  expect(groups[0].items.map(n=>n.id)).toEqual(['a','b'])
  expect(groups[1].items.map(n=>n.id)).toEqual(['c'])
  expect(doneCount).toBe(1)
  expect(horizonGroups(nodes,1,true).groups.map(g=>g.key)).toEqual(['0:g','0:h',UNLINKED])
 })
 it('names the grandparent once as a crumb and counts open children',()=>{
  const {groups}=horizonGroups(nodes,2,false)
  expect(groups[0]).toMatchObject({key:'1:a',crumb:'Together'})
  expect(groups.find(g=>g.key==='1:c')?.crumb).toBeNull()
  expect(childCount(nodes,nodes.find(n=>n.key==='0:g')!)).toBe(2)
 })
 it('at Year the intentions are the items',()=>{
  const {groups}=horizonGroups(nodes,0,false)
  expect(groups).toHaveLength(1);expect(groups[0].key).toBe(INTENTIONS)
  expect(groups[0].items.map(n=>n.id)).toEqual(['g'])
 })
})
describe('focusedGroupKeys',()=>{
 const {groups}=horizonGroups(nodes,2,false)
 it('narrows to a parent, a grandparent\'s groups, or Unlinked; an item or unknown key does not narrow',()=>{
  expect([...focusedGroupKeys(groups,nodes,2,'1:a')!]).toEqual(['1:a'])
  expect([...focusedGroupKeys(groups,nodes,2,'0:g')!]).toEqual(['1:a','1:b'])
  expect([...focusedGroupKeys(groups,nodes,2,UNLINKED)!]).toEqual([UNLINKED])
  expect(focusedGroupKeys(groups,nodes,2,'2:m')).toBeNull()
  expect(focusedGroupKeys(groups,nodes,2,'1:missing')).toBeNull()
  expect(focusedGroupKeys(groups,nodes,2,null)).toBeNull()
 })
})
