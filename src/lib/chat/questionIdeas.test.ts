import { describe, expect, it } from 'vitest'
import { questionLines, withIdea } from './questionIdeas'

describe('questionLines', () => {
  it('finds each numbered question in a reply (the mail routine, Oct 24)', () => {
    const reply = 'A couple of questions before I build this out:\n\n1. What day and time do you want to do the weekly processing?\n2. What are the steps you follow — both when mail arrives mid-week and for the weekly processing?'
    expect(questionLines(reply)).toEqual([
      { index: 2, question: 'What day and time do you want to do the weekly processing?', number: 1 },
      { index: 3, question: 'What are the steps you follow — both when mail arrives mid-week and for the weekly processing?', number: 2 },
    ])
  })
  it('one question has no number; bold and bullets are stripped', () => {
    expect(questionLines('Got it.\n- **Just this week, or from now on?**')).toEqual([{ index: 1, question: 'Just this week, or from now on?', number: null }])
  })
  it('unnumbered questions are numbered in order', () => {
    expect(questionLines('Which day works?\nWho does it?').map((q) => q.number)).toEqual([1, 2])
  })
  it('statements and tiny fragments are not questions', () => {
    expect(questionLines('Saved 3 changes.\nOK?\nShall I? Then I will add it.')).toEqual([])
  })
})

describe('withIdea', () => {
  it('starts the reply, then adds a line, numbered when there are several questions', () => {
    expect(withIdea('', 'Sunday at 7pm', null)).toBe('Sunday at 7pm')
    expect(withIdea('1. Sunday at 7pm  ', 'Open, sort, pay', 2)).toBe('1. Sunday at 7pm\n2. Open, sort, pay')
  })
})
