import { describe, it, expect } from 'vitest'
import { parseComposer, mentionsSymphony } from './composer'

describe('parseComposer', () => {
  it('routes an @Symphony message to ask with the mention stripped', () => {
    expect(parseComposer('@symphony  what next?')).toEqual({ kind: 'ask', text: 'what next?' })
    expect(parseComposer('@Symphony: plan this')).toEqual({ kind: 'ask', text: 'plan this' })
    expect(parseComposer('  @SYMPHONY plan')).toEqual({ kind: 'ask', text: 'plan' })
  })

  it('leaves plain text as a post', () => {
    expect(parseComposer('  Iris, can you grab this? ')).toEqual({ kind: 'post', text: 'Iris, can you grab this?' })
  })

  it('does not treat a mid-sentence mention as an ask', () => {
    expect(parseComposer('tell @symphony later')).toEqual({ kind: 'post', text: 'tell @symphony later' })
  })

  it('does not match a longer word that starts with symphony', () => {
    expect(parseComposer('@symphonyos hi')).toEqual({ kind: 'post', text: '@symphonyos hi' })
  })
})

describe('mentionsSymphony', () => {
  it('is true while the draft opens with the mention', () => {
    expect(mentionsSymphony('@Symph')).toBe(false)
    expect(mentionsSymphony('@Symphony')).toBe(true)
    expect(mentionsSymphony('@symphony ')).toBe(true)
    expect(mentionsSymphony('hello')).toBe(false)
  })
})
