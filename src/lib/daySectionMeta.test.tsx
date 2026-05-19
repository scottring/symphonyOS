import { describe, it, expect } from 'vitest'
import { Sunrise, Sun, Moon, Clock, Inbox } from 'lucide-react'
import { daySectionMeta } from './daySectionMeta'

describe('daySectionMeta', () => {
  it('morning', () => {
    const m = daySectionMeta('morning')
    expect(m.label).toBe('Morning')
    expect(m.range).toBe('6:00 AM – 12:00 PM')
    expect(m.Icon).toBe(Sunrise)
  })
  it('afternoon', () => {
    const m = daySectionMeta('afternoon')
    expect(m.range).toBe('12:00 PM – 5:00 PM')
    expect(m.Icon).toBe(Sun)
  })
  it('evening', () => {
    const m = daySectionMeta('evening')
    expect(m.range).toBe('5:00 PM – 10:00 PM')
    expect(m.Icon).toBe(Moon)
  })
  it('allday has no range', () => {
    const m = daySectionMeta('allday')
    expect(m.label).toBe('All Day')
    expect(m.range).toBe('')
    expect(m.Icon).toBe(Clock)
  })
  it('unscheduled has no range', () => {
    const m = daySectionMeta('unscheduled')
    expect(m.label).toBe('Unscheduled')
    expect(m.range).toBe('')
    expect(m.Icon).toBe(Inbox)
  })
})
