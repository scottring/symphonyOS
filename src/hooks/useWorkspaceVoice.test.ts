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

describe('heard line',()=>{
 it('stays on screen when the mic re-opens, and clears when the person speaks again',async()=>{
  const {result}=renderHook(()=>useWorkspaceVoice(context,vi.fn(),vi.fn(),true,'a'))
  await act(()=>result.current.start())
  const l=mocks.instances[0].listener
  act(()=>{l({type:'user',text:'Clean the yard'})});expect(result.current.heard).toBe('Clean the yard')
  act(()=>{l({type:'turn',turn:'listening'})});expect(result.current.heard).toBe('Clean the yard')
  act(()=>{l({type:'speaking',who:'user',active:true})});expect(result.current.heard).toBe('')
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

describe('approval transaction boundaries',()=>{
 it('never starts approval while another write is in flight',async()=>{
  let finish!:(text:string)=>void
  const ask=vi.fn(()=>new Promise<string>(resolve=>{finish=resolve})), approve=vi.fn(async()=>'saved' as const)
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a',approve))
  await act(()=>result.current.start());const tool=mocks.instances[0].deps.handleTool
  let pending!:Promise<unknown>
  act(()=>{pending=tool('ask_symphony',{request:'Move my task'})})
  await act(async()=>{expect(await tool('approve_card',{})).toHaveProperty('error')})
  expect(approve).not.toHaveBeenCalled()
  await act(async()=>{finish('Saved');await pending})
 })
 it('hands a partial result to speech without claiming nothing saved',async()=>{
  const {result}=renderHook(()=>useWorkspaceVoice(context,vi.fn(),vi.fn(),true,'a',async()=>'partial' as const))
  await act(()=>result.current.start())
  await act(async()=>{const got=await mocks.instances[0].deps.handleTool('approve_card',{});expect(got.outcome.state).toBe('partial');expect(got.outcome.say).toMatch(/Some changes stayed saved/)})
 })
 it.each(['Do not approve it yet.','Do not undo that.'])('does not treat negation as authorization: %s',async request=>{
  const ask=vi.fn(async()=>'Waiting'), approve=vi.fn(async()=>'saved' as const)
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a',approve))
  await act(()=>result.current.start())
  await act(async()=>{await mocks.instances[0].deps.handleTool('ask_symphony',{request})})
  expect(approve).not.toHaveBeenCalled();expect(ask).toHaveBeenCalledWith(request)
 })
})

describe('spoken Undo transaction',()=>{
 it('uses the real undo action without starting a new assistant turn',async()=>{
  const undo=vi.fn(async()=>'undone' as const),ask=vi.fn()
  const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a',undefined,undo))
  await act(()=>result.current.start())
  await act(async()=>{expect(await mocks.instances[0].deps.handleTool('ask_symphony',{request:'Undo that.'})).toMatchObject({outcome:{state:'saved',say:'Undone.'}})})
  expect(ask).not.toHaveBeenCalled();expect(undo).toHaveBeenCalledOnce()
 })
 it('does not call an unconfirmed Undo successful',async()=>{
  const {result}=renderHook(()=>useWorkspaceVoice(context,vi.fn(),vi.fn(),true,'a',undefined,async()=>'failed' as const))
  await act(()=>result.current.start())
  await act(async()=>{expect(await mocks.instances[0].deps.handleTool('undo_last_change',{})).toMatchObject({outcome:{state:'unverified'}})})
 })
})


it('sends final speech directly to the shared conversation and renders its exact reply',async()=>{
 const ask=vi.fn(async(_text:string)=>({text:'Which weekend day works?',outcome:{state:'answered' as const,say:'Which weekend day works?',writes:[]}}))
 const {result}=renderHook(()=>useWorkspaceVoice(context,ask,vi.fn(),true,'a'))
 await act(()=>result.current.start())
 let reply
 await act(async()=>{reply=await mocks.instances[0].deps.handleTurn('The library books would fit on the weekend.')})
 expect(ask).toHaveBeenCalledWith('The library books would fit on the weekend.')
 expect(ask).toHaveBeenCalledTimes(1)
 expect(reply).toBe('Which weekend day works?')
})


describe('voice session ending',()=>{
 it('explains a time limit and retains the last heard words for recovery',async()=>{
  const {result}=renderHook(()=>useWorkspaceVoice(context,vi.fn(),vi.fn(),true,'a'))
  await act(()=>result.current.start())
  act(()=>{
   mocks.instances[0].listener({type:'user',text:'Move the books to Saturday'})
   mocks.instances[0].listener({type:'status',status:'ended',reason:'time_limit'})
  })
  expect(result.current.active).toBe(false)
  expect(result.current.error).toContain('Voice reached its session limit')
  expect(result.current.heard).toBe('Move the books to Saturday')
  await act(()=>result.current.start())
  expect(result.current.error).toBeNull()
 })
 it('does not describe an intentional stop as a time limit',async()=>{
  const {result}=renderHook(()=>useWorkspaceVoice(context,vi.fn(),vi.fn(),true,'a'))
  await act(()=>result.current.start())
  act(()=>mocks.instances[0].listener({type:'status',status:'ended',reason:'stopped'}))
  expect(result.current.error).toBeNull()
 })
})
