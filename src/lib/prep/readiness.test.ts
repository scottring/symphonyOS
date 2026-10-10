import {describe,it,expect} from 'vitest'
import {readinessOf,planParent,describeReadiness,describeInherited,notesExcerpt,type ReadinessLookup} from './readiness'
import type {Task} from '@/types/task'
import type {Goal} from '@/types/goal'
const t=(id:string,rest:Partial<Task>={})=>({id,title:id,...rest} as Task)
const lookupOf=(tasks:Task[],goals:Goal[]=[],extra:Partial<ReadinessLookup>={}):ReadinessLookup=>({task:id=>tasks.find(x=>x.id===id),goal:id=>goals.find(g=>g.id===id),...extra})

describe('readinessOf: what the task carries',()=>{
 it('lists attached kinds in the standard order with counts',()=>{
  const task=t('call',{contactId:'cami',phoneNumber:'555',location:'School',links:[{url:'https://a.test'},{url:'https://b.test'}],notes:'Ask about pickup',subtasks:[t('s1',{completed:true}),t('s2')]})
  const r=readinessOf(task,lookupOf([task],[],{files:()=>1}))
  expect(r.kinds).toEqual(['contact','phone','place','link','file','steps','notes'])
  expect(r).toMatchObject({links:2,files:1,steps:{total:2,done:1}})
  expect(describeReadiness(r)).toEqual(['contact','phone','place','2 links','1 file','steps 1 of 2','notes'])
 })
 it('a bare task carries nothing, and a contact the reader cannot see is not counted',()=>{
  expect(readinessOf(t('bare'),lookupOf([])).kinds).toEqual([])
  expect(readinessOf(t('x',{contactId:'hidden'}),lookupOf([],[],{contactVisible:()=>false})).kinds).toEqual([])
  expect(readinessOf(t('x',{notes:'   '}),lookupOf([])).kinds).toEqual([])
 })
})

describe('readinessOf: from the plan above',()=>{
 const intention={id:'g',name:'Kids thrive',notes:'School year matters'} as Goal
 const season=t('season',{title:'Back to school',goalId:'g',links:[{url:'https://supplies.test',title:'Supply list'}]})
 const month=t('month',{title:'Classroom ready',sourceId:'season',links:[{url:'https://supplies.test'}],subtasks:[t('glue'),t('pencils',{completed:true})]})
 const week=t('week',{title:'Shop for class supplies',sourceId:'month'})
 it('walks action → milestone → season goal → intention, nearest first, without copying',()=>{
  const r=readinessOf(week,lookupOf([week,month,season],[intention]))
  expect(r.kinds).toEqual([])
  expect(r.inherited.map(x=>x.title)).toEqual(['Classroom ready','Kids thrive'])
  // The season goal's link is the milestone's link: listed once, at the nearest.
  expect(r.inherited[0].links.map(l=>l.url)).toEqual(['https://supplies.test'])
  expect(r.inherited[0].steps.map(s=>s.title)).toEqual(['glue','pencils'])
  expect(describeInherited(r.inherited[0])).toBe('1 link, list of 2')
  expect(r.inherited[1]).toMatchObject({entity:'goal',notes:'School year matters'})
  expect(week.links).toBeUndefined()
 })
 it('does not repeat what the task already carries',()=>{
  const own=t('week',{sourceId:'month',links:[{url:'https://supplies.test'}]})
  const r=readinessOf(own,lookupOf([own,month,season]))
  expect(r.inherited.map(x=>x.id)).toEqual(['month'])
  expect(r.inherited[0].links).toEqual([])
 })
 it('stops at a parent the reader cannot see, and falls back through legacy links',()=>{
  const hidden=t('a',{sourceId:'private'})
  expect(readinessOf(hidden,lookupOf([hidden])).inherited).toEqual([])
  expect(planParent(t('b',{sourceId:'private',goalTaskId:'month'}),lookupOf([month]))?.id).toBe('month')
 })
 it('survives a cycle',()=>{
  const a=t('a',{sourceId:'b',notes:'A'}),b=t('b',{sourceId:'a',notes:'B'})
  expect(readinessOf(a,lookupOf([a,b])).inherited.map(x=>x.id)).toEqual(['b'])
 })
})

it('excerpts the first lines of a note',()=>{
 expect(notesExcerpt('one\n\ntwo\nthree')).toEqual({text:'one\ntwo',more:true})
 expect(notesExcerpt('only')).toEqual({text:'only',more:false})
})
