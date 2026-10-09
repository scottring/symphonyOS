import {describe,it,expect} from 'vitest'
import {initialState,reducer,sequence,interpret} from './model'
describe('living canvas rehearsal contract',()=>{
 it('changes views without saving or changing the plan',()=>{
  let s=initialState
  for(const text of ['Plan the year','Look at the season','Shape October','Plan this week','What fits today?'])s=reducer(s,{type:'say',text})
  expect(s.scene).toBe('today');expect(s.saved).toBeNull();expect(s.draft).toEqual(initialState.draft)
 })
 it('returns to the exact planning period after cooking without losing edits or checks',()=>{
  let s=reducer(initialState,{type:'say',text:'Plan this month'})
  s=reducer(s,{type:'edit',id:'family',field:'month',value:'Spend a day at the lake'})
  s=reducer(s,{type:'say',text:'What is for dinner today?'})
  expect(s.scene).toBe('dinner')
  s=reducer(s,{type:'say',text:'Show me the recipe'})
  s=reducer(s,{type:'ingredient',name:'Pasta'})
  s=reducer(s,{type:'say',text:'Back to my planning conversation'})
  expect(s.scene).toBe('month');expect(s.checkedIngredients).toEqual(['Pasta']);expect(s.draft.threads[1].month).toBe('Spend a day at the lake')
 })
 it('keeps every intention across each period, including added intentions',()=>{
  let s=reducer(initialState,{type:'add',title:'Make more music',period:'year'})
  expect(s.draft.threads).toHaveLength(5)
  for(const scene of sequence){s=reducer(s,{type:'say',text:scene==='summary'?'Review my plan':`Plan ${scene}`});expect(s.draft.threads).toHaveLength(5)}
  expect(s.draft.threads[4].season).toBe('')
 })
 it('requires explicit save and isolates the saved copy from later edits',()=>{
  let s=reducer(initialState,{type:'say',text:'Save my plan'})
  expect(s.saved).toBeNull()
  s=reducer(s,{type:'save'});const saved=s.saved
  s=reducer(s,{type:'edit',id:'health',field:'week',value:'Compare training options'})
  expect(s.saved).toEqual(saved);expect(s.saved?.threads[0].week).not.toBe(s.draft.threads[0].week)
 })
 it('today selection keeps the same linked thread without duplicating it',()=>{
  const s=reducer(initialState,{type:'selectToday',id:'family'})
  expect(s.draft.today).toEqual(['health','family']);expect(s.draft.threads).toEqual(initialState.draft.threads)
 })
 it('unknown conversation never mutates or saves',()=>{
  const s=reducer(initialState,{type:'say',text:'Please reorganize everything and call Grandma'})
  expect(s.scene).toBe('welcome');expect(s.draft).toEqual(initialState.draft);expect(s.saved).toBeNull();expect(s.reply).toContain('scripted rehearsal')
 })
 it('distinguishes returning to the plan from asking about the recipe',()=>{
  expect(interpret('Back to my planning conversation')).toBe('back');expect(interpret('Show me the recipe')).toBe('cooking')
 })
})
