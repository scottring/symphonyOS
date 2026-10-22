import {describe,it,expect} from 'vitest'
import {claimsPreparedCard,proposalReply,proposalRepairToolAllowed} from './proposalEvidence'
describe('proposal receipt evidence',()=>{
 it.each([
  'All four items go on the card. Which day works?',
  'Shower at 4pm today is on the card.',
  "I've added the bicycle to the plan. The card is ready to review.",
  'I updated the card.',
  'The updated plan is ready to review. Nothing is saved until you approve.',
 ])('recognizes a claimed card: %s',reply=>expect(claimsPreparedCard(reply)).toBe(true))
 it.each([
  'What would you like on the card?',
  'I could not prepare the card.',
  'The card is not ready.',
  'If you approve the card, the tasks will be saved.',
  'Tomorrow is Friday. What time works?',
  'I can put those on a card after you clarify the day.',
 ])('does not turn a question or failure into an action: %s',reply=>expect(claimsPreparedCard(reply)).toBe(false))
})

it('adds a verified spoken wall proposal receipt without removing a natural follow-up question',()=>{
 expect(proposalReply('Which day for the test drive?', 'wall')).toBe('The updated plan is ready to review. Nothing is saved until you approve. Which day for the test drive?')
 expect(proposalReply(proposalReply('Which day?', 'wall'), 'wall')).toBe(proposalReply('Which day?', 'wall'))
})
it('while the family plans the week, asks the next question without reading out a receipt every turn',()=>{
 expect(proposalReply('Noted. Anything else on Thursday?', 'wall', true)).toBe('Noted. Anything else on Thursday?')
 expect(proposalReply('  ', 'wall', true)).toBe('Noted. Nothing is saved until you approve.')
})
it('repair tools cannot create or change persisted data',()=>{
 for(const name of ['symphony_create_task','symphony_update_task','symphony_draft_email','symphony_attach_source','symphony_add_to_scratchpad'])expect(proposalRepairToolAllowed(name)).toBe(false)
 expect(proposalRepairToolAllowed('symphony_read_week')).toBe(true)
 expect(proposalRepairToolAllowed('symphony_propose_changes')).toBe(true)
 expect(proposalRepairToolAllowed('symphony_propose_choice_changes')).toBe(true)
})

it('lets chat use its visible draft status without repeating a review preamble', () => {
 expect(proposalReply('Which day for the test drive?')).toBe('Which day for the test drive?')
 expect(proposalReply('  ')).toBe('The draft is ready. Choose Save when you’re ready.')
})
