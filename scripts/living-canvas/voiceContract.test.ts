import {describe,it,expect} from 'vitest'
import {parseCanvasCommand} from './voiceContract'
import {initialState,reducer} from './model'
describe('voice canvas boundary',()=>{
 it('accepts designed scenes only',()=>{expect(parseCanvasCommand('{"scene":"cooking"}')).toBe('cooking');for(const raw of ['null','[]','oops','{"scene":"__proto__"}','{"scene":"call"}','{"scene":"year","save":true}'])expect(parseCanvasCommand(raw)).toBeNull()})
 it('changing canvas cannot change or save plans',()=>{const next=reducer(initialState,{type:'show',scene:'month'});expect(next.draft).toBe(initialState.draft);expect(next.saved).toBeNull();expect(next.returnTo).toBe('month')})
})
