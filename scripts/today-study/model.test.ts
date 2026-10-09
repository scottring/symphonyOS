import {it,expect} from 'vitest'
import {sample,update,dates} from './model'
it('moves the same task without duplicating or changing its connection',()=>{let tasks=update(sample,{type:'schedule',id:'a',date:dates[0]});tasks=update(tasks,{type:'schedule',id:'a',date:dates[1]});expect(tasks).toHaveLength(sample.length);expect(tasks[0]).toEqual({...sample[0],date:dates[1]});expect(sample[0].date).toBeNull()})
it('completion and unscheduling preserve parent and identity',()=>{let tasks=update(sample,{type:'complete',id:'d'});tasks=update(tasks,{type:'schedule',id:'d',date:null});expect(tasks[3]).toEqual({...sample[3],done:true,date:null})})
it('rejects invalid dates and duplicate ids',()=>{expect(update(sample,{type:'schedule',id:'a',date:'bad'})).toBe(sample);expect(update(sample,{type:'add',task:sample[0]})).toBe(sample)})
