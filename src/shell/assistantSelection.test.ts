import {describe,it,expect} from 'vitest'
import {assistantSelection} from './assistantSelection'
import type {Task} from '@/types/task'
const tasks = [{id:'one',title:'Prepare picnic',notes:'Bring blanket',context:'family'},{id:'two',title:'Private work',notes:'Private notes',context:'work'}] as Task[]
describe('assistant selection context',()=>{
  it('uses only the selected visible task',()=>{
    expect(assistantSelection(tasks,{kind:'task',id:'one'},new Set(['family']))).toEqual({taskContext:{id:'one',title:'Prepare picnic',notes:'Bring blanket',kind:'task'},entityContext:{id:'one',name:'Prepare picnic',type:'task'}})
  })
  it('drops context when the item is hidden, missing, or no longer selected',()=>{
    for(const selection of [null,{kind:'task',id:'two'},{kind:'task',id:'missing'},{kind:'event',id:'one'}]) expect(assistantSelection(tasks,selection,new Set(['family']))).toEqual({entityContext:null})
  })
})
