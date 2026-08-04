import { describe, it, expect } from 'vitest'
import { parseFieldIntent } from './fieldIntent'

describe('parseFieldIntent', () => {
  it.each([
    // [query, expected terms, expected intent]
    ['podiatrist phone number', 'podiatrist', 'phone'],
    ['podiatrist phone', 'podiatrist', 'phone'],
    ['podiatrist number', 'podiatrist', 'phone'],
    ['podiatrist tel', 'podiatrist', 'phone'],
    ['podiatrist telephone', 'podiatrist', 'phone'],
    ['podiatrist email', 'podiatrist', 'email'],
    ['podiatrist e-mail', 'podiatrist', 'email'],
    ['podiatrist email address', 'podiatrist', 'email'],
    ['podiatrist address', 'podiatrist', 'address'],
    ['podiatrist location', 'podiatrist', 'address'],
    ['where is the podiatrist', 'is the podiatrist', 'address'],
  ])('parses %j -> terms %j, intent %j', (query, terms, intent) => {
    expect(parseFieldIntent(query)).toEqual({ terms, intent })
  })

  it('keeps the term when the query is only "phone" — intent is nulled out ' +
    'rather than stripping the only word to an empty search (see comment in ' +
    'fieldIntent.ts: an all-intent-vocabulary query reads as a literal search)',
  () => {
    expect(parseFieldIntent('phone')).toEqual({ terms: 'phone', intent: null })
  })

  it('keeps the terms when the query is only "phone number"', () => {
    expect(parseFieldIntent('phone number')).toEqual({ terms: 'phone number', intent: null })
  })

  it('keeps the term when the query is only "email address"', () => {
    expect(parseFieldIntent('email address')).toEqual({ terms: 'email address', intent: null })
  })

  it('keeps the term when the query is only "address"', () => {
    expect(parseFieldIntent('address')).toEqual({ terms: 'address', intent: null })
  })

  it('passes a query with no intent word through unchanged', () => {
    expect(parseFieldIntent('buy milk')).toEqual({ terms: 'buy milk', intent: null })
  })

  it('is case-insensitive when detecting intent words', () => {
    expect(parseFieldIntent('Podiatrist PHONE Number')).toEqual({ terms: 'Podiatrist', intent: 'phone' })
  })

  it('preserves the surviving terms\' original casing', () => {
    expect(parseFieldIntent('Call Dr Smith phone number')).toEqual({
      terms: 'Call Dr Smith',
      intent: 'phone',
    })
  })

  it('strips punctuation around and between words', () => {
    expect(parseFieldIntent("What's the podiatrist's phone number?")).toEqual({
      terms: "What's the podiatrist's",
      intent: 'phone',
    })
  })

  it('collapses irregular whitespace', () => {
    expect(parseFieldIntent('  podiatrist    phone   number  ')).toEqual({
      terms: 'podiatrist',
      intent: 'phone',
    })
  })

  it('returns empty terms and no intent for an empty query', () => {
    expect(parseFieldIntent('')).toEqual({ terms: '', intent: null })
  })

  it('only assigns the first intent encountered when multiple appear', () => {
    // "phone" and "email" both present — the earlier one wins, and both are
    // stripped since other terms survive either way.
    expect(parseFieldIntent('podiatrist phone or email')).toEqual({
      terms: 'podiatrist or',
      intent: 'phone',
    })
  })
})
