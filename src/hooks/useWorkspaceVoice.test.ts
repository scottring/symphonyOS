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
 it.each([
  'Two changes are on the card waiting for Approve. Nothing has been saved yet.',
  'Saved: call the bank this afternoon. Undo is available.',
  'Gmail is not connected, so I could not check those messages.',
 ])('hands the real assistant outcome to the voice unchanged: %s',async(reply)=>{
  const ask=vi.fn(async()=>reply)
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a'))
  await act(()=>result.current.start())
  const request='Move the bank call to tomorrow'
  expect(await mocks.instances[0].deps.handleTool('ask_symphony',{request})).toEqual({reply})
  expect(ask).toHaveBeenCalledWith(request)
  expect(ask).toHaveBeenCalledTimes(1)
 })
})

describe('spoken approve',()=>{
 it('approve_card saves the waiting card and says saved; "Approve" as text does the same',async()=>{
  const approveCard=vi.fn(async()=>'saved' as const);const ask=vi.fn(async()=>'answered')
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a',approveCard))
  await act(()=>result.current.start())
  const tool=mocks.instances[0].deps.handleTool
  expect(await tool('approve_card',{})).toEqual({reply:'Saved.',outcome:{state:'saved',say:'Saved.'}})
  expect(await tool('ask_symphony',{request:'Approve.'})).toEqual({reply:'Saved.',outcome:{state:'saved',say:'Saved.'}})
  expect(ask).not.toHaveBeenCalled()
 })
 it('with no card waiting, approve_card says so and "approve" as text goes to the assistant',async()=>{
  const approveCard=vi.fn(async()=>'none' as const);const ask=vi.fn(async()=>'Nothing to approve.')
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a',approveCard))
  await act(()=>result.current.start())
  const tool=mocks.instances[0].deps.handleTool
  expect((await tool('approve_card',{})) as {outcome:{state:string}}).toMatchObject({outcome:{state:'answered'}})
  expect(await tool('ask_symphony',{request:'approve'})).toEqual({reply:'Nothing to approve.'})
 })
 it('a failed approve is reported as failed, never as saved',async()=>{
  const {result}=renderHook(()=>useWorkspaceVoice(context,vi.fn(),vi.fn(),true,'a',async()=>'failed' as const))
  await act(()=>result.current.start())
  expect((await mocks.instances[0].deps.handleTool('approve_card',{})) as {outcome:{state:string}}).toMatchObject({outcome:{state:'failed'}})
 })
})
describe('ask_symphony outcome',()=>{
 it('hands the voice the server verdict beside the reply, never a bare "done"',async()=>{
  const ask=vi.fn(async()=>({text:'Three changes are on the card.',outcome:{state:'proposed' as const,writes:[],proposal:{key:'k',title:'3 changes',ops:3},say:'Shown as a change card. Nothing is saved until the person approves it.'}}))
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a'))
  await act(()=>result.current.start())
  const tool=mocks.instances[0].deps.handleTool
  const out=await tool('ask_symphony',{request:'Move those three to Friday'}) as {reply:string;outcome:{state:string;say:string;proposal?:{ops:number}}}
  expect(out.reply).toBe('Three changes are on the card.')
  expect(out.outcome.state).toBe('proposed');expect(out.outcome.proposal?.ops).toBe(3);expect(out.outcome.say).toMatch(/Nothing is saved/)
 })
 it('reports a dropped turn as failed, not silent',async()=>{
  const ask=vi.fn(async()=>undefined)
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a'))
  await act(()=>result.current.start())
  const tool=mocks.instances[0].deps.handleTool
  const out=await tool('ask_symphony',{request:'Add milk'}) as {reply:string;outcome:{state:string}}
  expect(out.outcome.state).toBe('failed');expect(out.reply).toMatch(/not processed/)
 })
})
