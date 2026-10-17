import {describe,it,expect,vi} from 'vitest'
import {resolveConversationAction} from './conversationActions'
describe('shared conversation actions',()=>{
 it('keeps ordinary intentions with the planner and never infers approval',async()=>{
 const approve=vi.fn(),undo=vi.fn()
 for(const text of ['Talk to my mom about dinner tonight','The weekend','yes, Saturday','Approve the budget next week','McGrew','Do not approve these changes','Should I approve these changes?'])expect(await resolveConversationAction(text,approve,undo)).toBeNull()
 expect(approve).not.toHaveBeenCalled();expect(undo).not.toHaveBeenCalled()
 })
 it.each(['saved','partial','failed','none'] as const)('records truthful %s approval receipts',async result=>{
 const got=await resolveConversationAction('Approve',async()=>result,async()=> 'none')
 expect(got?.outcome.state).toBe(({saved:'saved',partial:'partial',failed:'unverified',none:'answered'})[result])
 expect(got?.text).toBe(got?.outcome.say)
 })
 it('records Undo and failed actions without claiming success',async()=>{
 expect((await resolveConversationAction('Undo',async()=> 'none',async()=> 'undone'))?.text).toBe('Undone.')
 expect((await resolveConversationAction('Approve',async()=>{throw Error('offline')},async()=> 'none'))?.outcome.state).toBe('unverified')
 })
})

it.each(['Approve these changes.','Approve the changes','Save these changes.'])('accepts a clear complete approval phrase: %s',async text=>{
 const approve=vi.fn(async()=>'saved' as const)
 expect((await resolveConversationAction(text,approve,async()=>'none'))?.text).toBe('Saved.')
 expect(approve).toHaveBeenCalledTimes(1)
})
