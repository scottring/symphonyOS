import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {CHOICES_UPDATED} from '@/lib/choices/events'
import {applyReviewedChange} from './reviewedChange'
import {applyChangeSet,type ApplyDeps} from './applyChangeSet'
import type {ChangeSet} from './changeCard'
vi.mock('@/lib/supabase',()=>({supabase:{rpc:vi.fn()}}))
vi.mock('./applyChangeSet',()=>({applyChangeSet:vi.fn()}))
const set:ChangeSet={key:'turn-one',title:'Two things',ops:[{key:'a',op:'add',title:'Call Morgan'},{key:'b',op:'add',title:'Return books'}]}
const deps={weekStart:new Date('2026-10-11T04:00:00Z')} as ApplyDeps
const receipt={id:'command',attempt:'attempt-one',status:'open',fresh:true,ids:[]}
const writer=()=>({setReceipt:vi.fn(),drain:vi.fn(async()=>{})})
beforeEach(()=>vi.mocked(applyChangeSet).mockReset())
describe('reviewed Save receipt recovery',()=>{
 it('does not rerun writes when a successful save acknowledgement was lost',async()=>{
  const db={rpc:vi.fn(async()=>({data:{...receipt,status:'saved',fresh:false,ids:['one','two']},error:null}))}
  const result=await applyReviewedChange(set,deps,writer(),db as never)
  expect(result).toMatchObject({ok:true,ids:['one','two']});expect(applyChangeSet).not.toHaveBeenCalled()
 })
 it('closes and reverses an interrupted attempt before writing its retry',async()=>{
  const order:string[]=[]
  const db={rpc:vi.fn(async(name:string)=>{order.push(name);return {data:name==='begin_reviewed_change'?{...receipt,fresh:order.length>1}:name==='undo_reviewed_change'?true:receipt,error:null}})}
  vi.mocked(applyChangeSet).mockImplementation(async()=>{order.push('write');return {ok:true,ids:['one'],undo:async()=>true}})
  const result=await applyReviewedChange(set,deps,writer(),db as never)
  expect(result.ok).toBe(true);expect(order).toEqual(['begin_reviewed_change','undo_reviewed_change','begin_reviewed_change','write','finish_reviewed_change'])
  expect(applyChangeSet).toHaveBeenCalledWith(set,expect.objectContaining({managedRecovery:true}))
 })
 it('never overwrites a later edit to recover a partial save',async()=>{
  const db={rpc:vi.fn(async(name:string)=>({data:name==='begin_reviewed_change'?{...receipt,fresh:false}:null,error:name==='undo_reviewed_change'?{code:'PT409'}:null}))}
  expect(await applyReviewedChange(set,deps,writer(),db as never)).toMatchObject({ok:false,reverted:false,recoverable:false});expect(applyChangeSet).not.toHaveBeenCalled()
 })
 it('only claims rollback after the database confirms it',async()=>{
  vi.mocked(applyChangeSet).mockResolvedValue({ok:false,reason:'failed',reverted:false,kept:['one']})
  const db={rpc:vi.fn(async(name:string)=>({data:name==='begin_reviewed_change'?receipt:true,error:null}))}
  expect(await applyReviewedChange(set,deps,writer(),db as never)).toMatchObject({ok:false,reverted:true})
  db.rpc.mockImplementation(async name=>({data:name==='begin_reviewed_change'?receipt:null,error:name==='undo_reviewed_change'?{message:'offline'}:null}))
  expect(await applyReviewedChange(set,deps,writer(),db as never)).toMatchObject({ok:false,reverted:false,recoverable:true})
 })
 it('keeps the outcome uncertain when the receipt itself cannot be read',async()=>{
  const db={rpc:vi.fn(async()=>{throw new Error('offline')})}
  expect(await applyReviewedChange(set,deps,writer(),db as never)).toMatchObject({ok:false,reverted:false,recoverable:true});expect(applyChangeSet).not.toHaveBeenCalled()
 })
 it('a lost finish response is resolved by the next receipt read, not compensating writes',async()=>{
  const w=writer();vi.mocked(applyChangeSet).mockResolvedValue({ok:true,ids:['one'],undo:async()=>true})
  const db={rpc:vi.fn(async(name:string)=>({data:name==='begin_reviewed_change'?receipt:null,error:name==='finish_reviewed_change'?{message:'lost response'}:null}))}
  expect(await applyReviewedChange(set,deps,w,db as never)).toMatchObject({ok:false,reverted:false,recoverable:true})
  expect(db.rpc.mock.calls.map(c=>c[0])).toEqual(['begin_reviewed_change','finish_reviewed_change']);expect(w.setReceipt).toHaveBeenLastCalledWith(null)
 })
})

it('the same Undo receipt can be retried after a lost acknowledgement',async()=>{
 const db={rpc:vi.fn(async(name:string)=>({data:name==='begin_reviewed_change'?{...receipt,status:'saved',fresh:false,ids:['one']}:null,error:name==='undo_reviewed_change'?{message:'offline'}:null}))}
 const saved=await applyReviewedChange(set,deps,writer(),db as never)
 expect(saved.ok).toBe(true)
 if(saved.ok){await expect(saved.undo()).rejects.toMatchObject({name:'UndoOutcomeUnknown'});db.rpc.mockResolvedValue({data:true,error:null} as never);await expect(saved.undo()).resolves.toBe(true)}
})

describe('choice views refetch once the outcome is settled',()=>{
 const choiceSet:ChangeSet={key:'turn-two',title:'A status',ops:[{key:'c',op:'option_status',title:'Rob',choiceId:'ch1',optionId:'o1',optionName:'Rob',status:'contacted'}]}
 const events:string[]=[]
 const order:string[]=[]
 const listen=()=>{events.push('announce');order.push('announce')}
 beforeEach(()=>{events.length=0;order.length=0;window.addEventListener(CHOICES_UPDATED,listen)})
 afterEach(()=>window.removeEventListener(CHOICES_UPDATED,listen))
 it('a managed failure announces once, after the journal undo resolves',async()=>{
  vi.mocked(applyChangeSet).mockImplementation(async()=>{order.push('write');return {ok:false,reason:'failed',reverted:false,kept:['o1']}})
  const db={rpc:vi.fn(async(name:string)=>{order.push(name);return {data:name==='begin_reviewed_change'?receipt:true,error:null}})}
  expect(await applyReviewedChange(choiceSet,deps,writer(),db as never)).toMatchObject({ok:false,reverted:true})
  expect(order).toEqual(['begin_reviewed_change','write','undo_reviewed_change','announce'])
 })
 it('a managed success announces once, after finish; its later Undo announces after it resolves',async()=>{
  vi.mocked(applyChangeSet).mockImplementation(async()=>{order.push('write');return {ok:true,ids:['o1'],undo:async()=>true}})
  const db={rpc:vi.fn(async(name:string)=>{order.push(name);return {data:name==='begin_reviewed_change'?receipt:true,error:null}})}
  const r=await applyReviewedChange(choiceSet,deps,writer(),db as never)
  expect(r.ok).toBe(true)
  expect(order).toEqual(['begin_reviewed_change','write','finish_reviewed_change','announce'])
  if(r.ok)await r.undo()
  expect(order.slice(4)).toEqual(['undo_reviewed_change','announce'])
  expect(events).toHaveLength(2)
 })
 it('a set with no choice ops does not announce',async()=>{
  vi.mocked(applyChangeSet).mockResolvedValue({ok:true,ids:['one'],undo:async()=>true})
  const db={rpc:vi.fn(async(name:string)=>({data:name==='begin_reviewed_change'?receipt:true,error:null}))}
  await applyReviewedChange(set,deps,writer(),db as never)
  expect(events).toEqual([])
 })
})
