import {act,renderHook} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {WorkspaceContext} from '@/lib/workspace/context'
const mocks=vi.hoisted(()=>({instances:[] as any[]}))
vi.mock('@/lib/supabase',()=>({supabase:{auth:{getSession:vi.fn()}}}))
vi.mock('@/lib/voiceOnboarding/realtimeTransport',()=>({RealtimeTransport:class {
 deps:any; listener:any; stop=vi.fn(); sync=vi.fn(); setMuted=vi.fn(); sendText=vi.fn(()=>true)
 constructor(deps:any){this.deps=deps;mocks.instances.push(this)}
 subscribe(fn:any){this.listener=fn}
 async start(){this.listener({type:'status',status:'live'})}
}}))
import {useWorkspaceVoice} from './useWorkspaceVoice'
const context:WorkspaceContext={page:'today',date:'2026-10-09',layers:['family'],selectedId:null,items:[],truncated:false}
beforeEach(()=>mocks.instances.length=0)
describe('workspace voice',()=>{
 it('only opens on request and releases the connection on account change and unmount',async()=>{
  const {result,rerender,unmount}=renderHook(({account})=>useWorkspaceVoice(context,vi.fn(),vi.fn(),true,account),{initialProps:{account:'a'}})
  expect(mocks.instances).toHaveLength(0)
  await act(()=>result.current.start())
  const voice=mocks.instances[0]
  expect(result.current.active).toBe(true)
  rerender({account:'b'});expect(voice.stop).toHaveBeenCalled()
  unmount();expect(voice.stop).toHaveBeenCalledTimes(2)
 })
 it('awaits real saves and rejects concurrent tool requests',async()=>{
  let finish!:(s:string)=>void
  const ask=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve}))
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a'))
  await act(()=>result.current.start())
  const tool=mocks.instances[0].deps.handleTool
  const pending=tool('ask_symphony',{request:'Move the existing task to today'})
  expect(await tool('ask_symphony',{request:'Repeat'})).toHaveProperty('error')
  finish('Saved');expect(await pending).toEqual({reply:'Saved'});expect(ask).toHaveBeenCalledTimes(1)
 })
 it('validates destinations without changing data',async()=>{
  const navigate=vi.fn(),ask=vi.fn()
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,navigate,true,'a'))
  await act(()=>result.current.start())
  const tool=mocks.instances[0].deps.handleTool
  expect(await tool('show_workspace',{page:'today',date:'2026-02-31'})).toHaveProperty('error')
  await tool('show_workspace',{page:'week',date:'2026-10-09'})
  expect(navigate).toHaveBeenCalledWith('/week?view=alongside&date=2026-10-09');expect(ask).not.toHaveBeenCalled()
 })
})
