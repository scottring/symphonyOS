import {it,expect} from 'vitest'
import {proxyHeaders} from './proxy-headers'
it('preserves single-row response negotiation and database schema headers',()=>{
 expect(proxyHeaders({accept:'application/vnd.pgrst.object+json',prefer:'return=representation','accept-profile':'public','content-profile':'public',authorization:'Bearer test',host:'localhost',cookie:'private'},'anon')).toEqual({apikey:'anon',accept:'application/vnd.pgrst.object+json',prefer:'return=representation','accept-profile':'public','content-profile':'public',authorization:'Bearer test'})
})

it('keeps reviewed-save receipt headers so local and hosted recovery behave identically',()=>{
 expect(proxyHeaders({'x-symphony-command':'receipt','x-symphony-attempt':'attempt'},'anon')).toEqual({apikey:'anon','x-symphony-command':'receipt','x-symphony-attempt':'attempt'})
})
