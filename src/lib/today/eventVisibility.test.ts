import { describe, it, expect } from 'vitest'
import { isEventVisibleToFamily } from './eventVisibility'

describe('isEventVisibleToFamily', () => {
  it('includes family-tagged events', () => {
    expect(isEventVisibleToFamily('family', false)).toBe(true)
  })
  it('includes untagged (null) events', () => {
    expect(isEventVisibleToFamily(null, false)).toBe(true)
  })
  it('excludes private work/personal events that are not shared', () => {
    expect(isEventVisibleToFamily('work', false)).toBe(false)
    expect(isEventVisibleToFamily('personal', false)).toBe(false)
  })
  it('includes work/personal events explicitly shared with family', () => {
    expect(isEventVisibleToFamily('work', true)).toBe(true)
    expect(isEventVisibleToFamily('personal', true)).toBe(true)
  })
})
