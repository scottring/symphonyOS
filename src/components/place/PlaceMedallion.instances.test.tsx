import {render} from '@testing-library/react'
import {describe,it,expect} from 'vitest'
import {PlaceMedallion} from './PlaceMedallion'
describe('multiple place medallions',()=>{
 it('keeps SVG definitions unique across concurrently mounted details and conversation panes',()=>{
   const {container}=render(<><PlaceMedallion place="cabin"/><PlaceMedallion place="cabin"/><PlaceMedallion place="urban"/><PlaceMedallion place="urban"/><PlaceMedallion place="small-city"/><PlaceMedallion place="small-city"/></>)
   const ids=Array.from(container.querySelectorAll('[id]')).map(el=>el.id)
   expect(new Set(ids).size).toBe(ids.length)
   for(const el of container.querySelectorAll('[clip-path]')){
     const target=el.getAttribute('clip-path')!.slice(5,-1)
     expect(ids).toContain(target)
   }
 })
})
