import {describe,it,expect} from 'vitest'
import {connectionPair,eligibleParents,moveUnderPatch} from './connections'
import {planNodes} from './model'
import type {Task} from '@/types/task'
import type {Goal} from '@/types/goal'
const task=(id:string,rest:Partial<Task>={})=>({id,title:id,...rest} as Task)
const nodes=planNodes([{id:'y',name:'Together'} as Goal],[[task('s')],[task('m',{sourceId:'old'})],[task('w')]])
describe('link rules',()=>{
 it('pairs either direction between adjacent horizons only',()=>{
  const pair=connectionPair(nodes,'1:s','2:m')!
  expect(pair.child.id).toBe('m');expect(pair.parent.id).toBe('s')
  expect(connectionPair(nodes,'2:m','1:s')).toEqual(pair)
 })
 it('rejects skipped horizons, peers, missing filtered targets and self links',()=>{
  for(const [a,b] of [['0:y','2:m'],['2:m','2:m'],['2:m','1:hidden']])expect(connectionPair(nodes,a,b)).toBeNull()
  const shared=task('shared'),multi=planNodes([],[[shared,task('other')],[shared],[]])
  expect(connectionPair(multi,'2:shared','1:shared')).toBeNull()
  expect(connectionPair(multi,'2:shared','1:other')).toBeNull()
  expect(eligibleParents(multi,multi.find(n=>n.key==='2:shared')!)).toEqual([])
 })
})
describe('moveUnderPatch',()=>{
 const year=[{id:'g',name:'Together'} as Goal,{id:'h',name:'Health'} as Goal]
 it('links a seasonal goal through goal_id and undoes to the previous value',()=>{
  const n=planNodes(year,[[task('s',{goalId:'g'})],[],[]])
  expect(moveUnderPatch(n,n.find(x=>x.key==='1:s')!,n.find(x=>x.key==='0:h')!)).toStrictEqual({after:{goalId:'h'},before:{goalId:'g'}})
  expect(moveUnderPatch(n,n.find(x=>x.key==='1:s')!,null)).toStrictEqual({after:{goalId:undefined},before:{goalId:'g'}})
 })
 it('moves a milestone: source_id, the new intention, and no legacy link to the old parent',()=>{
  const n=planNodes(year,[[task('a',{goalId:'g'}),task('b',{goalId:'h'})],[task('m',{sourceId:'a',goalTaskId:'a',goalId:'g'})],[]])
  const m=n.find(x=>x.key==='2:m')!
  expect(moveUnderPatch(n,m,n.find(x=>x.key==='1:b')!)).toStrictEqual({after:{sourceId:'b',goalTaskId:undefined,goalId:'h'},before:{sourceId:'a',goalTaskId:'a',goalId:'g'}})
  expect(moveUnderPatch(n,m,n.find(x=>x.key==='1:a')!)).toBeNull()
 })
 it('clears goal_id when the new parent serves no intention',()=>{
  const n=planNodes(year,[[task('a',{goalId:'g'}),task('b')],[task('m',{sourceId:'a',goalId:'g'})],[]])
  expect(moveUnderPatch(n,n.find(x=>x.key==='2:m')!,n.find(x=>x.key==='1:b')!)?.after).toStrictEqual({sourceId:'b',goalId:undefined})
 })
 it('unlinks a weekly action including a duplicated legacy fallback, never touching hidden parents',()=>{
  const n=planNodes([],[[],[task('m')],[task('w',{sourceId:'m',goalTaskId:'m'}),task('v',{sourceId:'private'})]])
  expect(moveUnderPatch(n,n.find(x=>x.key==='3:w')!,null)?.after).toStrictEqual({sourceId:undefined,goalTaskId:undefined})
  expect(moveUnderPatch(n,n.find(x=>x.key==='3:v')!,null)).toBeNull()
 })
})
