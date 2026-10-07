import { describe, it, expect } from 'vitest'
import { notePreview } from './notePreview'

describe('notePreview', () => {
  it('is the note in plain words, its heading dropped', () => {
    expect(notePreview('## Flow Summary\nCalled to schedule a sleep study; offered the 29th, 30th or 31st.'))
      .toBe('Called to schedule a sleep study; offered the 29th, 30th or 31st.')
    expect(notePreview('<h2>Summary</h2><p>Must respond within <strong>30 days</strong> of the letter.</p>'))
      .toBe('Must respond within 30 days of the letter.')
    expect(notePreview('- Pages 12–14\n- [Worksheet](https://example.com/ws) due Fri'))
      .toBe('Pages 12–14 Worksheet due Fri')
  })

  it('says nothing when the note says nothing', () => {
    expect(notePreview(undefined)).toBeNull()
    expect(notePreview('')).toBeNull()
    expect(notePreview('ok')).toBeNull()
    expect(notePreview('# Just a heading')).toBeNull()
    expect(notePreview('https://www.fultonbank.com/branches')).toBeNull()
  })
})
