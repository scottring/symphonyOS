import { describe, it, expect } from 'vitest'
import { parseMealRequest } from './useChat'

describe('parseMealRequest', () => {
  it('extracts the request and strips the block', () => {
    const txt = 'On it.\n:::meal-request\nadd pasta to Tuesday this week\n:::'
    const r = parseMealRequest(txt)
    expect(r.mealRequest).toBe('add pasta to Tuesday this week')
    expect(r.content).toBe('On it.')
  })
  it('returns undefined when no block', () => {
    const r = parseMealRequest('just a normal answer')
    expect(r.mealRequest).toBeUndefined()
    expect(r.content).toBe('just a normal answer')
  })
  it('treats an empty block as no request', () => {
    const r = parseMealRequest(':::meal-request\n\n:::')
    expect(r.mealRequest).toBeUndefined()
  })
})
