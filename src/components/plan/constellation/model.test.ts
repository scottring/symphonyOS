import {describe,it,expect} from 'vitest'
import {planNodes,branchKeys} from './model'
import type {Task} from '@/types/task'
import type {Goal} from '@/types/goal'
const t=(id:string,rest:Partial<Task>={}):Task=>({id,title:id,...rest} as Task)
const g={id:'year',name:'Together'} as Goal
 describe('saved plan appearances',()=>{
 it('connects all siblings through existing lineage',()=>{
 const n=planNodes([g],[[t('season',{goalId:'year'})],[t('picnic',{sourceId:'season'}),t('movies',{supportsGoalTaskId:'season'})],[t('book',{sourceId:'picnic'})]])
 expect(n.find(x=>x.id==='movies')?.parent).toBe('1:season')
 expect(n.find(x=>x.id==='book')?.parent).toBe('2:picnic')
 expect(n.filter(x=>x.parent==='1:season')).toHaveLength(2)
 })
 it('keeps unmatched and filtered-parent items visible independently without disclosing parent',()=>{
 const n=planNodes([],[[t('s',{goalId:'hidden'})],[t('m',{sourceId:'private'})],[]])
 expect(n.every(x=>x.parent===null)).toBe(true)
 expect(n.map(x=>x.title)).toEqual(['s','m'])
 })
 it('keeps one record appearing in two periods without self cycles or copies',()=>{
 const same=t('shared')
 const n=planNodes([],[[same],[same],[t('a',{sourceId:'shared'})]])
 expect(n.map(x=>x.key)).toEqual(['1:shared','2:shared','3:a'])
 expect(n[1].parent).toBe('1:shared');expect(n[1].task).toBe(same)
 })
 })

describe('focused branches',()=>{
 it('keeps every descendant and ancestor but removes sibling branches',()=>{
  const nodes=planNodes([g],[[t('season',{goalId:'year'}),t('other',{goalId:'year'})],[t('picnic',{sourceId:'season'}),t('movies',{sourceId:'season'})],[t('book',{sourceId:'picnic'}),t('pack',{sourceId:'picnic'})]])
  expect([...branchKeys(nodes,'2:picnic')].sort()).toEqual(['0:year','1:season','2:picnic','3:book','3:pack'])
  expect(branchKeys(nodes,'0:year').size).toBe(nodes.length)
 })
 it('does not infer connections to filtered or absent parents',()=>{
  const nodes=planNodes([],[[t('independent')],[t('unrelated')],[]])
  expect([...branchKeys(nodes,'1:independent')]).toEqual(['1:independent'])
  expect(branchKeys(nodes,'missing').size).toBe(0)
 })
})
