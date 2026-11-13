import { describe, it, expect } from 'vitest'
import { displayTitle, isShouted, marginClock } from './displayTitle'
import { itemIcon } from './itemIcon'
import { PackageOpen, Phone, Stethoscope } from 'lucide-react'

describe('displayTitle (Scott, 2026-11-13)', () => {
  it('quiets a shouted invitation and drops the address run on after the ellipsis', () => {
    expect(displayTitle('KAUFMAN-LEVINER BATH PROJECT...3806 TUDOR ARMS')).toBe('Kaufman-Leviner Bath Project')
    expect(displayTitle('CEPI STANDBY')).toBe('Cepi Standby')
  })
  it('leaves titles written in normal case exactly as written', () => {
    expect(displayTitle('Grampappa')).toBe('Grampappa')
    expect(displayTitle('amazon returns')).toBe('amazon returns')
    expect(displayTitle('Call CEPI about the Q4 deck...')).toBe('Call CEPI about the Q4 deck...')
    expect(isShouted('PE')).toBe(false)
  })
  it('says the margin clock without ":00"', () => {
    expect(marginClock(new Date(2026, 10, 13, 7, 0))).toBe('7 AM')
    expect(marginClock(new Date(2026, 10, 13, 19, 30))).toBe('7:30 PM')
    expect(marginClock(new Date(2026, 10, 13, 12, 0))).toBe('12 PM')
  })
})

describe('itemIcon', () => {
  it('says what kind of thing a row is, or nothing', () => {
    expect(itemIcon('amazon returns')).toBe(PackageOpen)
    expect(itemIcon('Call with Christian')).toBe(Phone)
    expect(itemIcon('Book the neurologist follow-up')).toBe(Stethoscope)
    expect(itemIcon('Ella sleepover invite')).toBeNull()
  })
})
