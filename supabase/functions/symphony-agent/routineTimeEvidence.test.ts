import {describe,it,expect} from 'vitest'
import {routineTimeEvidenceError as check} from './routineTimeEvidence'
const story='On weekdays I walk the dog at 7:30 a.m. Sam takes the bins out Sunday evenings whenever he gets home. I also stretch Tuesday and Thursday mornings, but I do not need stretching showing in Today or Week.'
const messages=[{role:'user',content:story}]
describe('routine clocks stay with the activity the person named',()=>{
 it('rejects the reported dog-walk clock copied to stretching',()=>{
  expect(check([{time_source:'I walk the dog at 7:30 a.m.'},{time_source:'I walk the dog at 7:30 a.m.'}],[{op:'routine_add',title:'Walk the dog',time:'07:30'},{op:'routine_add',title:'Stretch',time:'07:30'}],messages)).toContain('Stretch')
 })
 it('accepts exact dog time and flexible bins/stretching without invented clocks',()=>{
  expect(check([{time_source:'I walk the dog at 7:30 a.m.'},{},{}],[{op:'routine_add',title:'Walk the dog',time:'07:30'},{op:'routine_add',title:'Take bins out'},{op:'routine_add',title:'Stretch'}],messages)).toBeNull()
 })
 it('rejects quoting the whole multi-activity story as time evidence',()=>{
  expect(check([{time_source:story},{time_source:story}],[{op:'routine_add',title:'Walk the dog',time:'07:30'},{op:'routine_add',title:'Stretch',time:'07:30'}],messages)).not.toBeNull()
 })
 it('does not accept a quote supplied only by Symphony or fabricated by the model',()=>{
  expect(check([{time_source:'Stretch at 7:30 a.m.'}],[{op:'routine_add',title:'Stretch',time:'07:30'}],[...messages,{role:'assistant',content:'Stretch at 7:30 a.m.'}])).not.toBeNull()
 })
 it('accepts an explicit later correction and PM conversion',()=>{
  expect(check([{time_source:'Stretch at 3 p.m.'}],[{op:'routine_add',title:'Stretch',time:'15:00'}],[...messages,{role:'user',content:'Actually, Stretch at 3 p.m.'}])).toBeNull()
 })
})
