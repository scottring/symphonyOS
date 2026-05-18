import { describe, it, expect } from 'vitest'
import { formatInboxBullet } from './inboxBullet'

describe('formatInboxBullet', () => {
  const fixedNow = new Date(2026, 4, 18, 14, 23) // 2026-05-18 14:23 local

  it('formats title-only items as a single timestamped bullet line', () => {
    const out = formatInboxBullet(
      { title: 'Look into bike storage', notes: undefined },
      fixedNow,
    )
    expect(out).toBe('- 2026-05-18 14:23 — Look into bike storage')
  })

  it('appends indented notes on a second line when present', () => {
    const out = formatInboxBullet(
      { title: 'Vet appointment', notes: 'Check the new tag too' },
      fixedNow,
    )
    expect(out).toBe('- 2026-05-18 14:23 — Vet appointment\n  Check the new tag too')
  })

  it('treats empty-string notes the same as missing notes', () => {
    const out = formatInboxBullet(
      { title: 'Task', notes: '' },
      fixedNow,
    )
    expect(out).toBe('- 2026-05-18 14:23 — Task')
  })

  it('pads single-digit months, days, hours, minutes', () => {
    const out = formatInboxBullet(
      { title: 'X', notes: undefined },
      new Date(2026, 0, 3, 4, 5), // Jan 3, 4:05
    )
    expect(out).toBe('- 2026-01-03 04:05 — X')
  })
})
