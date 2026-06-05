import { describe, it, expect } from 'vitest'
import { parseMealRequest } from './parseMealRequest'

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

  it('extracts meal block cleanly when other content is present', () => {
    const r = parseMealRequest('Note saved.\n:::meal-request\nadd pasta tuesday\n:::')
    expect(r.mealRequest).toBe('add pasta tuesday')
    expect(r.content).toBe('Note saved.')
  })

  it('preserves multiline body', () => {
    const r = parseMealRequest(':::meal-request\nadd pasta\nand salad\n:::')
    expect(r.mealRequest).toBe('add pasta\nand salad')
  })

  // ── Real-world LLM formatting tolerance (the production bug) ──────────────
  // Models don't reproduce the exact 3-line fence reliably. The strict
  // /\n:::/ requirement rejected real output and broke the whole feature.
  // The parser must tolerate fence-whitespace variance.

  it('tolerates NO newline before the closing fence', () => {
    const r = parseMealRequest(':::meal-request\nadd a tofu stir fry to Wednesday this week:::')
    expect(r.mealRequest).toBe('add a tofu stir fry to Wednesday this week')
    expect(r.content).toBe('')
  })

  it('tolerates a single-line block (no newlines around the body)', () => {
    const r = parseMealRequest(':::meal-request add a tofu stir fry to Wednesday this week :::')
    expect(r.mealRequest).toBe('add a tofu stir fry to Wednesday this week')
  })

  it('handles the exact production-observed clean shape', () => {
    const r = parseMealRequest(':::meal-request\nadd a tofu stir fry to Wednesday this week\n:::')
    expect(r.mealRequest).toBe('add a tofu stir fry to Wednesday this week')
    expect(r.content).toBe('')
  })

  it('tolerates a one-sentence ack before the block', () => {
    const r = parseMealRequest('Got it — adding that.\n\n:::meal-request\nadd a tofu stir fry to Wednesday this week\n:::')
    expect(r.mealRequest).toBe('add a tofu stir fry to Wednesday this week')
    expect(r.content).toBe('Got it — adding that.')
  })

  // ACCEPTED TRADE-OFF: a literal ::: inside the request now truncates the
  // body at the first :::. This is intentional — the handoff prompt
  // normalizes the request and real meal requests never contain ":::".
  // Common-case robustness >> protecting a pathological input.
  it('truncates at a bare ::: inside the body (accepted trade-off)', () => {
    const r = parseMealRequest(':::meal-request\nadd pasta ::: with cream\n:::')
    expect(r.mealRequest).toBe('add pasta')
  })
})
