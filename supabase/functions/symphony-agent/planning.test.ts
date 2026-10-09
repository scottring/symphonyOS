import {describe,it,expect} from 'vitest'
import {planningRow} from './planning'
describe('planning rows',()=>{
 it('writes the correct period without scheduling or completing it',()=>{
  expect(planningRow({title:'Picnic ready',level:'month',period_start:'2026-10-01',context:'family'})).toEqual({table:'tasks',row:{title:'Picnic ready',bucket:'month',month_start:'2026-10-01',context:'family',completed:false}})
 })
 it('keeps yearly intentions in goals',()=>{
  expect(planningRow({title:' Time together ',level:'year',period_start:'2026-01-01',context:'family'})).toMatchObject({table:'goals',row:{name:'Time together',year:2026}})
 })
 it('rejects invalid dates and missing life areas',()=>{
  expect(()=>planningRow({title:'x',level:'week',period_start:'2026-02-31',context:'family'})).toThrow()
  expect(()=>planningRow({title:'x',level:'week',period_start:'2026-10-09'})).toThrow()
 })
})

import {validatePlanningParent} from './planning'
it('rejects wrong horizons and life areas but accepts a retained commitment',()=>{
 const input={level:'week',context:'family',period_start:'2026-10-04'}
 expect(()=>validatePlanningParent(input,{context:'family',bucket:'inbox'})).toThrow()
 expect(()=>validatePlanningParent(input,{context:'personal',bucket:'month'})).toThrow()
 expect(()=>validatePlanningParent(input,{context:'family',bucket:'timed'},['month'])).not.toThrow()
 expect(()=>validatePlanningParent({level:'season',context:'family',period_start:'2026-10-01'},{context:'family',year:2025})).toThrow()
})

import {planningWeekStart} from './planning'
it('anchors spoken weekly actions to the household week',()=>{
 expect(planningWeekStart('2026-10-05',0)).toBe('2026-10-04')
 expect(planningWeekStart('2026-10-09',6)).toBe('2026-10-03')
 expect(planningWeekStart('2026-10-09',1)).toBe('2026-10-05')
})
