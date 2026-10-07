import { describe, it, expect } from 'vitest'
import { cardNotePreview } from './cardNotePreview'

describe('cardNotePreview', () => {
  it('shows a note as plain words — no HTML, no markdown', () => {
    expect(cardNotePreview('<p>Must respond within <strong>30 days</strong> of the letter.</p>')).toBe('Must respond within 30 days of the letter.')
    expect(cardNotePreview('## Plan\n- call the **bank**\n- see [Jennifer](https://x.y) again')).toBe('Plan call the bank see Jennifer again')
  })
  it('shows nothing when there is nothing worth reading at a glance', () => {
    expect(cardNotePreview(undefined)).toBeNull()
    expect(cardNotePreview('   ')).toBeNull()
    expect(cardNotePreview('<p>ok</p>')).toBeNull()
    expect(cardNotePreview('https://www.fultonbank.com/branches')).toBeNull()
  })
})
