import { describe, it, expect, vi, afterEach } from 'vitest'
import { htmlToPlainText, notesAsText, stripHtml } from './htmlUtils'

afterEach(() => vi.restoreAllMocks())

// Review 2026-10-04: notes come from other people, agents and email. Parsing
// them through a live-document element loads <img> and runs onerror; an inert
// DOMParser document does not.
describe('notes as text', () => {
  it('reads editor HTML as text, line by line', () => {
    expect(notesAsText('<ul><li><p>Called and left vm for Melinda</p></li><li><p>called Barr</p></li></ul>')).toBe('Called and left vm for Melinda\ncalled Barr')
    expect(notesAsText('plain words')).toBe('plain words')
    expect(notesAsText(undefined)).toBe('')
  })

  it('never parses notes in the live document', () => {
    const create = vi.spyOn(document, 'createElement')
    htmlToPlainText('<img src="x" onerror="window.__pwned = 1"><p>hi</p>')
    stripHtml('<img src="x" onerror="window.__pwned = 1">hi')
    expect(create).not.toHaveBeenCalled()
  })
})
