import {describe,it,expect} from 'vitest'
import {connectedDestination} from './connectedDestination'
describe('connected horizon navigation',()=>{
 it('keeps the viewed period and enters its connected surface',()=>{
   expect(connectedDestination('/month?start=2026-10-01','?view=alongside')).toBe('/month?start=2026-10-01&view=constellation&horizon=2')
   expect(connectedDestination('/week?date=2026-10-04','?view=constellation')).toBe('/week?date=2026-10-04&view=alongside')
   expect(connectedDestination('/today','?view=constellation')).toBe('/today?view=alongside')
 })
 it('leaves ordinary navigation unchanged and carries the shell into supporting pages',()=>{
   expect(connectedDestination('/month?start=2026-10-01','')).toBe('/month?start=2026-10-01')
   expect(connectedDestination('/contacts','?view=alongside')).toBe('/contacts?workspace=1')
   expect(connectedDestination('/today','?workspace=1')).toBe('/today?view=alongside')
 })
})
