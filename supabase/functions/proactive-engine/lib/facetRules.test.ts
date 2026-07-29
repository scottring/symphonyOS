import { describe, it, expect } from 'vitest'
import { facetRuleSuggestions } from './facetRules'
import type { BundleFact } from '../../_shared/context-graph/types'

const task = { id: 't1', title: 'Call the camp', phone_number: null }
const phoneFact: BundleFact = { facet: { type: 'phone', label: 'Front desk', number: '410-555-0100' }, attachmentId: 'a1' }
const linkFact: BundleFact = { facet: { type: 'link', label: 'Booking', url: 'https://example.com/book' }, attachmentId: 'a1' }

describe('facetRuleSuggestions', () => {
  it('phone facet on a task without its own number → call suggestion', () => {
    const out = facetRuleSuggestions(task, [phoneFact])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      suggestion_type: 'call',
      action_payload: { phoneNumber: '410-555-0100' },
      suggestion_key: 'task:t1:rule:facet_call',
    })
  })
  it('no suggestion when the task already has a phone number', () => {
    expect(facetRuleSuggestions({ ...task, phone_number: '555' }, [phoneFact])).toHaveLength(0)
  })
  it('link facet → open_link suggestion, one per task max', () => {
    const out = facetRuleSuggestions(task, [linkFact, { ...linkFact, attachmentId: 'a2' }])
    expect(out).toHaveLength(1)
    expect(out[0].action_payload).toMatchObject({ url: 'https://example.com/book' })
  })
})
