import { describe, expect, it } from 'vitest'
import { buildWallPrompt, parseAskBody, parseWallReply, replyFromResponse } from './prompt'

describe('wall-ask reply parsing', () => {
  it('a plain reply is an answer', () => {
    expect(parseWallReply('Mia has swim at 4:15.')).toEqual({ answer: 'Mia has swim at 4:15.' })
  })
  it('CHANGE: is a change request, tidied and capped at 120 characters', () => {
    expect(parseWallReply('CHANGE: add Feed Jax to Ella’s morning routine')).toEqual({ change: 'add Feed Jax to Ella’s morning routine' })
    expect(parseWallReply('change:  ' + 'x'.repeat(300))).toEqual({ change: 'x'.repeat(120) })
  })
  it('an empty CHANGE is nothing', () => {
    expect(parseWallReply('CHANGE:')).toBeNull()
    expect(parseWallReply('  ')).toBeNull()
  })
  it('the prompt tells the model about CHANGE', () => {
    expect(buildWallPrompt('q', 's').system).toContain('CHANGE: ')
  })
})

describe('wall-ask truncation ("I do not")', () => {
  // Reproduces the live bug: a reply cut off by max_tokens used to be spoken
  // as "I do not". It is now treated as no answer, never a garbled one.
  it('a max_tokens cut-off is not an answer', () => {
    expect(replyFromResponse({ stop_reason: 'max_tokens', content: [{ type: 'thinking' }, { type: 'text', text: 'I do not' }] })).toBeNull()
  })
  it('a complete reply after non-text blocks is used', () => {
    expect(replyFromResponse({ stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: 'I do not see that on the wall.' }] }))
      .toEqual({ answer: 'I do not see that on the wall.' })
  })
})

describe('wall-ask request body (400, never a 500)', () => {
  it('non-string question or snapshot is rejected', () => {
    expect(parseAskBody({ question: 'hi', snapshot: { a: 1 } })).toHaveProperty('error')
    expect(parseAskBody({ question: ['x'], snapshot: 's' })).toHaveProperty('error')
    expect(parseAskBody(null)).toHaveProperty('error')
    expect(parseAskBody('str')).toHaveProperty('error')
  })
  it('empty or too-long input is rejected; good input is trimmed', () => {
    expect(parseAskBody({ question: ' ', snapshot: 's' })).toHaveProperty('error')
    expect(parseAskBody({ question: 'q'.repeat(301), snapshot: 's' })).toHaveProperty('error')
    expect(parseAskBody({ question: 'q', snapshot: ' ' })).toHaveProperty('error')
    expect(parseAskBody({ question: ' q ', snapshot: ' s ' })).toEqual({ question: 'q', snapshot: 's' })
  })
})
