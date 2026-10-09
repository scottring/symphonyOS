import {describe,it,expect} from 'vitest'
import {workspaceContext,workspaceDestination} from './context'
import type {Task} from '@/types/task'
const task=(id:string,context='family')=>({id,title:id,context,bucket:'week',completed:false,createdAt:new Date('2026-10-09')} as Task)
describe('workspace context',()=>{
 it('excludes hidden layers and hidden selections',()=>{
  const result=workspaceContext([task('family'),task('private','personal')],'/week','',new Set(['family']),'private',new Date('2026-10-09T12:00:00'))
  expect(result.items.map(t=>t.id)).toEqual(['family']);expect(result.selectedId).toBeNull()
 })
 it('bounds snapshots and preserves the selected item',()=>{
  const tasks=Array.from({length:80},(_,i)=>task(String(i)))
  const result=workspaceContext(tasks,'/month','?start=2026-10-01',new Set(['family']),'79')
  expect(result.items).toHaveLength(60);expect(result.items[0].id).toBe('79');expect(result.truncated).toBe(true);expect(result.date).toBe('2026-10-01')
 })
 it('only allows known canvas destinations',()=>{
  expect(workspaceDestination('week','2026-10-09')).toBe('/week?view=alongside&date=2026-10-09')
  expect(workspaceDestination('year')).toBe('/year?view=constellation&horizon=0')
  expect(workspaceDestination('https://evil.example')).toBeNull()
  expect(workspaceDestination('today','bad')).toBeNull()
 })
})
