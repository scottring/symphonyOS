import { describe, it, expect } from 'vitest'
import { isTimestampedKind } from './kinds'

describe('isTimestampedKind', () => {
  it('includes both connector-rendered kinds', () => {
    expect(isTimestampedKind('whatsapp_export')).toBe(true)
    expect(isTimestampedKind('classdojo_thread')).toBe(true)
  })

  it('excludes free text and images, which have no message timeline', () => {
    expect(isTimestampedKind('text')).toBe(false)
    expect(isTimestampedKind('image')).toBe(false)
  })
})
