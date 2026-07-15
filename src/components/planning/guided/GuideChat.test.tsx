import { describe, it, expect } from 'vitest'
import { parseSuggestions } from './parseSuggestions'

describe('parseSuggestions', () => {
  it('parses a clean JSON array', () => {
    expect(parseSuggestions('["Order dishwasher", "Call contractor"]'))
      .toEqual(['Order dishwasher', 'Call contractor'])
  })

  it('parses JSON embedded in prose (models narrate despite instructions)', () => {
    const reply = 'Here are some moves:\n["Migrate auth module", "Write Firestore rules"]\nGood luck!'
    expect(parseSuggestions(reply)).toEqual(['Migrate auth module', 'Write Firestore rules'])
  })

  it('falls back to bullet lines when there is no JSON', () => {
    const reply = '- Order the dishwasher\n• Call the contractor\n2) Book the inspection'
    expect(parseSuggestions(reply)).toEqual(['Order the dishwasher', 'Call the contractor', 'Book the inspection'])
  })

  it('drops headings, blanks, and over-long lines in fallback mode', () => {
    const long = 'x'.repeat(150)
    expect(parseSuggestions(`Suggested moves:\n\n- Real item\n${long}`)).toEqual(['Real item'])
  })

  it('caps at six suggestions', () => {
    const arr = JSON.stringify(Array.from({ length: 10 }, (_, i) => `Item ${i}`))
    expect(parseSuggestions(arr)).toHaveLength(6)
  })

  it('ignores non-string entries in a JSON array', () => {
    expect(parseSuggestions('["ok", 42, null, "also ok"]')).toEqual(['ok', 'also ok'])
  })
})
