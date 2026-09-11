import { describe, it, expect } from 'vitest'
import { noteHeading } from './noteHeading'

describe('noteHeading', () => {
  it('prefers the note\'s own title', () => {
    expect(noteHeading('Yoto cards', '<p>anything</p>')).toBe('Yoto cards')
  })

  it('reads words, not markup, out of an HTML body', () => {
    const html = '<p><strong>OVERALL PROCESS</strong></p><ul><li><p>In NFC Tools</p></li></ul>'
    expect(noteHeading(null, html)).toBe('OVERALL PROCESS')
  })

  it('skips leading empty blocks', () => {
    expect(noteHeading('', '<p></p><p>Plumber quoted $400</p>')).toBe('Plumber quoted $400')
  })

  it('takes the first line of a plain-text body', () => {
    expect(noteHeading(undefined, 'First line\nSecond line')).toBe('First line')
  })

  it('decodes entities', () => {
    expect(noteHeading(null, '<p>Mia &amp; Liam</p>')).toBe('Mia & Liam')
  })

  it('falls back when there is nothing to show', () => {
    expect(noteHeading(null, '<p></p>')).toBe('Untitled note')
    expect(noteHeading(null, '', '')).toBe('')
  })
})
