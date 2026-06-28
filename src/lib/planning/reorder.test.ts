import { describe, it, expect } from 'vitest'
import { dropMins, minsToSlot, clampToBand, SLOT_BASE_MINS } from './reorder'

describe('minsToSlot', () => {
  it('maps minutes to the right slot at the boundaries', () => {
    expect(minsToSlot(540)).toBe('morning')   // 9:00
    expect(minsToSlot(719)).toBe('morning')   // 11:59
    expect(minsToSlot(720)).toBe('afternoon') // 12:00
    expect(minsToSlot(1079)).toBe('afternoon')// 17:59
    expect(minsToSlot(1080)).toBe('evening')  // 18:00
  })
})

describe('clampToBand', () => {
  it('keeps a time inside its slot band', () => {
    expect(clampToBand(100, 'morning')).toBe(360)   // floor 6:00
    expect(clampToBand(2000, 'evening')).toBe(1439) // ceil 23:59
    expect(clampToBand(600, 'morning')).toBe(600)   // already inside
  })
})

describe('dropMins', () => {
  it('takes the midpoint between two neighbours', () => {
    expect(dropMins(540, 600, 'morning')).toBe(570) // between 9:00 and 10:00 → 9:30
  })
  it('sits 15 min after the previous when dropped at the end', () => {
    expect(dropMins(600, null, 'morning')).toBe(615)
  })
  it('sits 15 min before the next when dropped at the start', () => {
    expect(dropMins(null, 600, 'morning')).toBe(585)
  })
  it('uses the slot base when the slot is empty', () => {
    expect(dropMins(null, null, 'afternoon')).toBe(SLOT_BASE_MINS.afternoon)
  })
  it('clamps a cross-slot drop into the destination band', () => {
    // dropping after an 11:50 item but into the evening slot → clamped to evening floor
    expect(dropMins(710, null, 'evening')).toBe(1080)
  })
})
