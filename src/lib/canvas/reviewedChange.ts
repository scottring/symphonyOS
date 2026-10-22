import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { applyChangeSet, type ApplyDeps, type ApplyResult } from './applyChangeSet'
import { isChoiceOp, type ChangeSet } from './changeCard'
import { announceChoices } from '@/lib/choices/events'

// A separate client is used ONLY by the chat card's writers. Other pages and
// background writes cannot accidentally become part of the card's Undo.
export function createReviewedWriter() {
  let current: { id: string; attempt: string } | null = null
  const pending = new Set<Promise<Response>>()
  const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    accessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers)
      if (current && !['GET','HEAD'].includes(init?.method ?? 'GET')) {
        headers.set('x-symphony-command',current.id); headers.set('x-symphony-attempt',current.attempt)
      }
      const promise = fetch(input,{...init,headers})
      pending.add(promise)
      void promise.finally(()=>pending.delete(promise)).catch(()=>{})
      return promise
    } },
  })
  return { client, setReceipt: (receipt: typeof current) => { current=receipt }, drain: async () => {
    while(pending.size) await Promise.allSettled([...pending])
  } }
}
type Receipt = { id:string; attempt:string; status:'open'|'saved'|'undone'; fresh:boolean; ids:string[] }
type Writer = Pick<ReturnType<typeof createReviewedWriter>,'setReceipt'|'drain'>
export async function applyReviewedChange(set:ChangeSet,deps:ApplyDeps,writer:Writer,db:Pick<SupabaseClient,'rpc'>=supabase):Promise<ApplyResult> {
  const payload={ops:set.ops,weekStart:deps.weekStart.toISOString(),defaultContext:deps.defaultContext??null}
  // A revision is a different command; a retry of that revision has the same key.
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)))
  const key=`${set.key}:${Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}`
  let receipt:Receipt|undefined
  let undoConflict=false
  // Choice views refetch only once the outcome is settled: after finish, or
  // after the journal's undo of a failed attempt, never mid-save.
  const touchesChoices=set.ops.some(isChoiceOp)
  let wrote=false
  const undo=async()=>{
    if(!receipt)return false
    const {data,error}=await db.rpc('undo_reviewed_change',{p_id:receipt.id,p_attempt:receipt.attempt})
    undoConflict=error?.code==='PT409'||error?.code==='42501'
    if(undoConflict)return false
    if(error||data!==true){const unknown=new Error('Could not confirm Undo');unknown.name='UndoOutcomeUnknown';throw unknown}
    return true
  }
  /** The receipt's Undo, as the card's Undo button calls it later. */
  const laterUndo=async()=>{
    try {return await undo()} finally {if(touchesChoices)announceChoices()}
  }
  const begin=async()=>{
    const {data,error}=await db.rpc('begin_reviewed_change',{p_key:key,p_payload:payload})
    if(error||!data)throw new Error('Could not read the save receipt')
    return data as Receipt
  }
  try {
    receipt=await begin()
    if(receipt.status==='saved')return {ok:true,ids:receipt.ids,undo:laterUndo}
    if(!receipt.fresh) {
      // A previous browser/request may have disappeared after committing. Close
      // that attempt under its database lock BEFORE starting another one.
      if(!await undo())return {ok:false,reason:'failed',reverted:false,kept:receipt.ids,recoverable:!undoConflict}
      receipt=await begin()
    }
    writer.setReceipt(receipt)
    wrote=true
    const result=await applyChangeSet(set,{...deps,managedRecovery:true})
    await writer.drain()
    writer.setReceipt(null)
    if(!result.ok) {
      const reverted=await undo()
      return result.reason==='stale'&&reverted?result:{ok:false,reason:'failed',reverted,kept:result.reason==='failed'?result.kept:[],recoverable:!reverted&&!undoConflict}
    }
    const {data,error}=await db.rpc('finish_reviewed_change',{p_id:receipt.id,p_attempt:receipt.attempt,p_ids:result.ids})
    if(error||!data)throw new Error('Could not confirm the save receipt')
    return {ok:true,ids:result.ids,undo:laterUndo}
  } catch {
    // Never guess that a lost acknowledgement means nothing saved. Retrying
    // first consults this durable receipt; it cannot blindly create a second row.
    return {ok:false,reason:'failed',reverted:false,kept:receipt?.ids??[],recoverable:true}
  } finally {
    writer.setReceipt(null)
    if(wrote&&touchesChoices)announceChoices()
  }
}
