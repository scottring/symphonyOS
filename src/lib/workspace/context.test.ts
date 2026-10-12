import {describe,it,expect} from 'vitest'
import {workspaceContext,workspaceDestination} from './context'
import type {Task} from '@/types/task'
import {localYmd,readCadenceConfig,weekStartAnchor} from '@/lib/cadence/config'
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
 it('names the horizon on screen, not the path the Plan canvas was opened on',()=>{
  const at=(path:string,search:string)=>workspaceContext([],path,search,new Set(['family']),null,new Date('2026-10-11T12:00:00')).page
  expect(at('/month','?view=constellation&horizon=0')).toBe('year')
  expect(at('/year','?view=constellation&horizon=1')).toBe('season')
  expect(at('/year','?view=constellation&horizon=2&start=2026-10-01')).toBe('month')
  expect(at('/month','?view=constellation')).toBe('month')
  expect(at('/week','?view=alongside')).toBe('week')
 })
 it('says whether the page shows a past, current or future period, so a plan for a past week is not mistaken for this one',()=>{
  const mon=new Date('2026-10-12T09:00:00')
  const at=(path:string,search:string)=>workspaceContext([],path,search,new Set(['family']),null,mon).viewing
  // Whatever day the household's week starts on (Saturday for Scott's).
  const thisWeek=weekStartAnchor(mon,readCadenceConfig().weekStartsOn)
  const plus=(days:number)=>localYmd(new Date(thisWeek.getFullYear(),thisWeek.getMonth(),thisWeek.getDate()+days))
  expect(at('/week',`?view=alongside&date=${plus(-9)}&start=${plus(-9)}`)).toBe('past')
  expect(at('/week',`?view=alongside&start=${plus(0)}`)).toBe('current')
  expect(at('/week','?view=alongside')).toBe('current')
  expect(at('/week',`?view=alongside&start=${plus(7)}`)).toBe('future')
  expect(at('/today','?view=alongside&date=2026-10-11')).toBe('past')
  expect(at('/today','?view=alongside')).toBe('current')
  expect(at('/month','?view=constellation&horizon=2&start=2026-09-01')).toBe('past')
  expect(at('/season','?view=constellation&horizon=1')).toBe('current')
 })
 it('only allows known canvas destinations',()=>{
  expect(workspaceDestination('week','2026-10-09')).toBe('/week?view=alongside&date=2026-10-09')
  expect(workspaceDestination('year')).toBe('/year?view=constellation&horizon=0')
  expect(workspaceDestination('https://evil.example')).toBeNull()
  expect(workspaceDestination('today','bad')).toBeNull()
 })
})
