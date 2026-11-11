import { describe, expect, it } from 'vitest'
import { noteKeyword } from './notesQuery'

describe('noteKeyword', () => {
  it('strips PostgREST filter syntax from a natural question', () => {
    expect(noteKeyword("Kaleb's school, pickup (times).")).toBe("Kaleb's school pickup times")
    expect(noteKeyword('a*b%c:d"e\\f')).toBe('a b c d e f')
  })
  it('caps the length', () => {
    expect(noteKeyword('x'.repeat(500))).toHaveLength(120)
  })
})
