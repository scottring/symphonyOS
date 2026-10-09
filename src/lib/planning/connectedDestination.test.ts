import {describe,it,expect} from 'vitest'
import {connectedDestination,defaultPlanningDestination} from './connectedDestination'
describe('connected horizon navigation',()=>{
 it('keeps the viewed period and enters its connected surface',()=>{
   expect(connectedDestination('/month?start=2026-10-01','?view=alongside')).toBe('/month?start=2026-10-01&view=constellation&horizon=2')
   expect(connectedDestination('/week?date=2026-10-04','?view=constellation')).toBe('/week?date=2026-10-04&view=alongside')
   expect(connectedDestination('/today','?view=constellation')).toBe('/today?view=alongside')
 })
 it('defaults ordinary navigation to the workspace and carries it into supporting pages',()=>{
   expect(connectedDestination('/month?start=2026-10-01','')).toBe('/month?start=2026-10-01&view=constellation&horizon=2')
   expect(connectedDestination('/contacts','?view=alongside')).toBe('/contacts?workspace=1')
   expect(connectedDestination('/today','?workspace=1')).toBe('/today?view=alongside')
 })
})

it('upgrades old bookmarks, preserving date and other query parameters',()=>{
 expect(defaultPlanningDestination('/week','?date=2026-10-12&task=abc')).toBe('/week?date=2026-10-12&task=abc&view=alongside')
 expect(defaultPlanningDestination('/season','?start=2026-09-01&view=classic')).toBe('/season?start=2026-09-01&view=constellation&horizon=1')
 expect(defaultPlanningDestination('/year','?view=constellation&horizon=3&focus=3:x')).toBeNull()
 expect(defaultPlanningDestination('/wall-v2','')).toBeNull()
 expect(defaultPlanningDestination('/settings','')).toBeNull()
})
