import {it,expect} from 'vitest'
import {initial,add,descendants} from './model'
it('supports multiple milestones, monthly plans and weekly actions',()=>{expect(initial.filter(n=>n.parent==='family')).toHaveLength(2);expect(initial.filter(n=>n.parent==='weekends')).toHaveLength(3);expect(initial.filter(n=>n.parent==='picnic')).toHaveLength(2)})
it('adds a sibling without overwriting or relinking existing branches',()=>{const next=add(initial,{id:'new',parent:'weekends',level:2,text:'Go camping',color:'wrong'});expect(next.slice(0,-1)).toEqual(initial);expect(next.at(-1)?.color).toBe('#ca8469');expect(descendants(next,'family').some(n=>n.id==='new')).toBe(true)})
it('rejects invalid parents, wrong horizons and duplicate ids',()=>{for(const node of [{id:'new',parent:'missing',level:2,text:'x',color:'x'},{id:'new',parent:'family',level:3,text:'x',color:'x'},{...initial[0]}])expect(add(initial,node)).toBe(initial)})
it('independent items do not invent ancestors',()=>{const next=add(initial,{id:'solo',parent:null,level:2,text:'Renew passport',color:'#aaa'});expect(next.at(-1)?.parent).toBeNull();expect(next.filter(n=>n.level===0)).toHaveLength(3)})
