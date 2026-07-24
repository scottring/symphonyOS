import { describe, it, expect } from 'vitest'
import { SESSIONS } from './sessions'

describe('seasonal arc', () => {
  it('walks welcome → carry/win/release → pick-by-goal → standalone → calendar → look-within → book-next', () => {
    const ids = SESSIONS.seasonal.steps.map((s) => s.type)
    expect(ids).toEqual(['narration', 'review', 'pick-by-goal', 'pick-by-goal', 'calendar', 'reflect', 'book-next'])
  })
  it('the standalone pick step is flagged', () => {
    const standalone = SESSIONS.seasonal.steps.find((s) => s.type === 'pick-by-goal' && s.props?.standalone)
    expect(standalone).toBeTruthy()
  })
})
