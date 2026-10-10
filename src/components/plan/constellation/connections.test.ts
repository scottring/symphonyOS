import {describe,it,expect} from 'vitest'
import {connectionPair,connectionPatch,priorConnection} from './connections'
import {planNodes} from './model'
import type {Task} from '@/types/task'
import type {Goal} from '@/types/goal'
const task=(id:string,rest:Partial<Task>={})=>({id,title:id,...rest} as Task)
const nodes=planNodes([{id:'y',name:'Together'} as Goal],[[task('s')],[task('m',{sourceId:'old'})],[task('w')]])
describe('drag connection rules',()=>{
 it('accepts either drag direction and writes only the parent field',()=>{
  const pair=connectionPair(nodes,'1:s','2:m')!
  expect(pair.child.id).toBe('m');expect(pair.parent.id).toBe('s')
  expect(connectionPair(nodes,'2:m','1:s')).toEqual(pair)
  expect(connectionPatch(pair.child,pair.parent)).toEqual({sourceId:'s'})
  expect(priorConnection(pair.child)).toEqual({sourceId:'old'})
  const annual=connectionPair(nodes,'0:y','1:s')!
  expect(connectionPatch(annual.child,annual.parent)).toEqual({goalId:'y'})
 })
 it('rejects skipped horizons, peers, missing filtered targets and self links',()=>{
  for(const [a,b] of [['0:y','2:m'],['2:m','2:m'],['2:m','1:hidden']])expect(connectionPair(nodes,a,b)).toBeNull()
  const shared=task('shared'),multi=planNodes([],[[shared,task('other')],[shared],[]])
  expect(connectionPair(multi,'2:shared','1:shared')).toBeNull()
  expect(connectionPair(multi,'2:shared','1:other')).toBeNull()
 })
})
