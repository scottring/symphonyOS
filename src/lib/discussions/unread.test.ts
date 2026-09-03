import { describe, it, expect } from 'vitest'
import { isUnread } from './unread'

const t = (iso: string) => new Date(iso)
const me = { id: 'u1', kind: 'member' as const }
const iris = { id: 'u2', kind: 'member' as const }
const symphony = { id: null, kind: 'symphony' as const }

describe('isUnread', () => {
  it('is false for an empty thread', () => {
    expect(isUnread([], 'u1', null)).toBe(false)
  })

  it('is false when the last message is mine, even with no read stamp', () => {
    const msgs = [
      { timestamp: t('2026-09-02T10:00:00Z'), author: iris },
      { timestamp: t('2026-09-02T10:05:00Z'), author: me },
    ]
    expect(isUnread(msgs, 'u1', null)).toBe(false)
  })

  it('is true when a partner posted after my stamp', () => {
    const msgs = [{ timestamp: t('2026-09-02T10:05:00Z'), author: iris }]
    expect(isUnread(msgs, 'u1', t('2026-09-02T10:00:00Z'))).toBe(true)
  })

  it('is false when I read after the partner posted', () => {
    const msgs = [{ timestamp: t('2026-09-02T10:05:00Z'), author: iris }]
    expect(isUnread(msgs, 'u1', t('2026-09-02T10:06:00Z'))).toBe(false)
  })

  it('counts a Symphony reply as unread when I have no stamp', () => {
    const msgs = [{ timestamp: t('2026-09-02T10:05:00Z'), author: symphony }]
    expect(isUnread(msgs, 'u1', null)).toBe(true)
  })

  it('treats a legacy authorless member message as not mine', () => {
    const msgs = [{ timestamp: t('2026-09-02T10:05:00Z'), author: { id: null, kind: 'member' as const } }]
    expect(isUnread(msgs, 'u1', null)).toBe(true)
  })
})
