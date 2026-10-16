import type {AgentTurnResult} from './agentTurn'
import type {ApproveCard,UndoChange} from '../hooks/useWorkspaceVoice'
export const isConversationApproval = (text:string) => /^\s*(?:ok(?:ay)?[,.]?\s*)?(?:yes[,.]?\s*)?(?:approve(?:d| (?:it|all|them|everything|(?:these|the|all the) changes))?|save (?:it|them|(?:these|the) changes)|go ahead|do it)[.!]*\s*$/i.test(text)

export async function resolveConversationAction(text:string, approve:ApproveCard, undo:UndoChange):Promise<AgentTurnResult|null> {
 const isUndo=/^\s*undo(?: (?:that|it|the last change))?[.!]*\s*$/i.test(text)
 const isApprove=isConversationApproval(text)
 if(!isUndo&&!isApprove)return null
 let state:AgentTurnResult['outcome']['state']='answered',reply='There is no card to approve right now.'
 try {
  const result=isUndo?await undo():await approve()
  if(result==='saved'||result==='undone'){state='saved';reply=isUndo?'Undone.':'Saved.'}
  else if(result==='partial'){state='partial';reply='Only part was saved. Check the card before trying again.'}
  else if(result==='failed'){state='unverified';reply=isUndo?'Could not confirm Undo. Check the page.':'Could not confirm the save. Check the card.'}
  else if(isUndo)reply='There is no change to undo.'
 }catch{state='unverified';reply='Could not confirm the change. Check the page before trying again.'}
 return {text:reply,error:null,didWrite:state==='saved'||state==='partial',outcome:{state,say:reply,writes:[]}}
}
