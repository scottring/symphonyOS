import {describe,it,expect,vi} from 'vitest'
vi.mock('@/lib/supabase',()=>({supabase:{rpc:vi.fn().mockResolvedValue({data:null,error:{message:'Household unavailable'}})}}))
vi.mock('@/hooks/useWeather',()=>({setHomeCoords:vi.fn()}))
import {initialsFor,skipFirstRunSetup} from './firstRun'
describe('first-run form helpers',()=>{
  it('uses up to two initials',()=>{expect(initialsFor('Jess Rivera')).toBe('JR');expect(initialsFor(' ')).toBe('?')})
  it('does not silently skip a failed household save',async()=>{await expect(skipFirstRunSetup('u1')).rejects.toThrow('Household unavailable')})
})
