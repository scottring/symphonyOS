import { describe, it, expect } from 'vitest'
import { buildMessage, parseBody, parseUtterance } from './logic.ts'

const SYMPTOMS = [
  { id: '1', name: 'Tremor' },
  { id: '2', name: 'Stiffness' },
  { id: '3', name: 'Dyskinesia' },
]

describe('parseBody', () => {
  it('rejects a missing utterance', () => {
    expect(parseBody({}).ok).toBe(false)
  })
  it('rejects a blank utterance', () => {
    expect(parseBody({ utterance: '   ' }).ok).toBe(false)
  })
  it('accepts a valid body', () => {
    expect(parseBody({ utterance: 'severe tremor' })).toEqual({
      ok: true, utterance: 'severe tremor', logged_at: undefined,
    })
  })
  it('accepts a valid logged_at', () => {
    const r = parseBody({ utterance: 'tremor', logged_at: '2026-07-14T15:00:00Z' })
    expect(r).toEqual({ ok: true, utterance: 'tremor', logged_at: '2026-07-14T15:00:00Z' })
  })
  it('rejects a non-ISO logged_at', () => {
    expect(parseBody({ utterance: 'tremor', logged_at: 'yesterday' }).ok).toBe(false)
  })
})

describe('parseUtterance — severity', () => {
  it.each([
    ['mild tremor', 1], ['light tremor', 1], ['slight tremor', 1],
    ['moderate tremor', 2], ['medium tremor', 2],
    ['severe tremor', 3], ['bad tremor', 3], ['intense tremor', 3], ['strong tremor', 3],
  ] as const)('"%s" → severity %i', (utterance, severity) => {
    const r = parseUtterance(utterance, SYMPTOMS)
    expect(r.severity).toBe(severity)
    expect(r.matches).toEqual([SYMPTOMS[0]])
  })
  it('defaults to moderate when no severity word', () => {
    expect(parseUtterance('tremor', SYMPTOMS).severity).toBe(2)
  })
  it('matches severity words on word boundaries only', () => {
    // "backlight" must not read as "light"
    const r = parseUtterance('backlight tremor', SYMPTOMS)
    expect(r.severity).toBe(2)
    expect(r.note).toBe('backlight')
  })
  it('first severity word by position wins', () => {
    expect(parseUtterance('mild tremor pretty bad', SYMPTOMS).severity).toBe(1)
  })
})

describe('parseUtterance — symptom matching', () => {
  it('matches case-insensitively', () => {
    expect(parseUtterance('DYSKINESIA', SYMPTOMS).matches).toEqual([SYMPTOMS[2]])
  })
  it('logs all distinct matches', () => {
    const r = parseUtterance('tremor and stiffness', SYMPTOMS)
    expect(r.matches).toEqual([SYMPTOMS[0], SYMPTOMS[1]])
    expect(r.note).toBeNull()
  })
  it('overlapping names: keeps only the longer match', () => {
    const syms = [{ id: '1', name: 'Tremor' }, { id: '4', name: 'Resting Tremor' }]
    const r = parseUtterance('resting tremor', syms)
    expect(r.matches).toEqual([syms[1]])
    expect(r.note).toBeNull()
  })
  it('no match returns empty matches', () => {
    const r = parseUtterance('severe headache', SYMPTOMS)
    expect(r.matches).toEqual([])
    expect(r.note).toBeNull()
  })
})

describe('parseUtterance — note extraction', () => {
  it('leftover text becomes the note', () => {
    const r = parseUtterance('severe tremor after workout', SYMPTOMS)
    expect(r.severity).toBe(3)
    expect(r.matches).toEqual([SYMPTOMS[0]])
    expect(r.note).toBe('after workout')
  })
  it('dangling connectors are trimmed to null', () => {
    expect(parseUtterance('tremor and stiffness', SYMPTOMS).note).toBeNull()
    expect(parseUtterance('mild tremor and', SYMPTOMS).note).toBeNull()
  })
  it('preserves the original casing of the note', () => {
    expect(parseUtterance('Tremor during CrossFit', SYMPTOMS).note).toBe('during CrossFit')
  })
})

describe('buildMessage', () => {
  it('single symptom', () => {
    expect(buildMessage(['Tremor'], 3, '2:47 PM')).toBe('Logged Tremor, severe, at 2:47 PM')
  })
  it('two symptoms', () => {
    expect(buildMessage(['Tremor', 'Stiffness'], 2, '9:05 AM'))
      .toBe('Logged Tremor and Stiffness, moderate, at 9:05 AM')
  })
  it('three symptoms use comma + and', () => {
    expect(buildMessage(['Tremor', 'Stiffness', 'Dyskinesia'], 1, '9:05 AM'))
      .toBe('Logged Tremor, Stiffness and Dyskinesia, mild, at 9:05 AM')
  })
})
