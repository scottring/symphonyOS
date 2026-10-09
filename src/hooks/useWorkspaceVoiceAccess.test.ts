import {act,renderHook,waitFor} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
const invoke=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/supabase',()=>({supabase:{functions:{invoke}}}))
import {useWorkspaceVoiceAccess} from './useWorkspaceVoiceAccess'
beforeEach(()=>{invoke.mockReset()})
it('discovers access without starting a paid session',async()=>{
 invoke.mockResolvedValue({data:{enabled:true},error:null})
 const {result}=renderHook(()=>useWorkspaceVoiceAccess('pilot',true))
 await waitFor(()=>expect(result.current).toBe(true))
 expect(invoke).toHaveBeenCalledWith('workspace-voice',{method:'GET'})
})
it('does not reuse access or late responses for another account',async()=>{
 let resolve!:(v:unknown)=>void
 invoke.mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValue({data:{enabled:false}})
 const {result,rerender}=renderHook(({id})=>useWorkspaceVoiceAccess(id,true),{initialProps:{id:'first'}})
 rerender({id:'second'})
 await act(async()=>resolve({data:{enabled:true}}))
 expect(result.current).toBe(false)
})
it('fails closed and skips disconnected workspaces',async()=>{
 invoke.mockRejectedValue(new Error('offline'))
 const {result,rerender}=renderHook(({enabled})=>useWorkspaceVoiceAccess('pilot',enabled),{initialProps:{enabled:false}})
 expect(invoke).not.toHaveBeenCalled()
 await act(async()=>rerender({enabled:true}))
 expect(result.current).toBe(false)
})
