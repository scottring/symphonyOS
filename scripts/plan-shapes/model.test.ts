import {it,expect} from 'vitest'
import {initial,add,descendants} from './model'
it('supports multiple milestones, monthly plans and weekly actions',()=>{expect(initial.filter(n=>n.parent==='family')).toHaveLength(2);expect(initial.filter(n=>n.parent==='weekends')).toHaveLength(3);expect(initial.filter(n=>n.parent==='picnic')).toHaveLength(2)})
it('adds a sibling without overwriting or relinking existing branches',()=>{const next=add(initial,{id:'new',parent:'weekends',level:2,text:'Go camping',color:'wrong'});expect(next.slice(0,-1)).toEqual(initial);expect(next.at(-1)?.color).toBe('#ca8469');expect(descendants(next,'family').some(n=>n.id==='new')).toBe(true)})
it('rejects invalid parents, wrong horizons and duplicate ids',()=>{for(const node of [{id:'new',parent:'missing',level:2,text:'x',color:'x'},{id:'new',parent:'family',level:3,text:'x',color:'x'},{...initial[0]}])expect(add(initial,node)).toBe(initial)})
it('independent items do not invent ancestors',()=>{const next=add(initial,{id:'solo',parent:null,level:2,text:'Renew passport',color:'#aaa'});expect(next.at(-1)?.parent).toBeNull();expect(next.filter(n=>n.level===0)).toHaveLength(3)})

import {schedule,complete,sampleDays} from './model'
it('schedules an action directly without generating a child or duplicate',()=>{const next=schedule(initial,'date',sampleDays[0]);expect(next).toHaveLength(initial.length);expect(next.find(n=>n.id==='date')).toEqual({...initial.find(n=>n.id==='date'),date:sampleDays[0]})})
it('schedules task steps independently of their action and siblings',()=>{const next=schedule(initial,'weather',sampleDays[1]);expect(next.find(n=>n.id==='weather')?.date).toBe(sampleDays[1]);expect(next.find(n=>n.id==='date')?.date).toBeUndefined();expect(next.find(n=>n.id==='packing')?.date).toBeUndefined()})
it('completion does not silently complete parent or sibling',()=>{const next=complete(initial,'weather');expect(next.find(n=>n.id==='weather')?.done).toBe(true);expect(next.find(n=>n.id==='date')?.done).toBeUndefined();expect(next.find(n=>n.id==='packing')?.done).toBeUndefined()})
it('cannot schedule an intention and rejects unsupported dates',()=>{expect(schedule(initial,'family',sampleDays[0])).toEqual(initial);expect(schedule(initial,'date','invalid')).toBe(initial)})
