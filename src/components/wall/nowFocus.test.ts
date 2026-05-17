import { describe, it, expect } from 'vitest'
import { resolveNowFocus } from './nowFocus'

describe('resolveNowFocus', () => {
  const baseInput = {
    pinned: null,
    override: null,
    rhythmMode: 'day' as const,
    imminent: null,
  }

  it('returns pinned when pinned', () => {
    const focus = resolveNowFocus({ ...baseInput, pinned: { kind: 'recipe', title: 'Pinned recipe' } })
    expect(focus.kind).toBe('pinned')
  })

  it('returns override-mode when override is set', () => {
    const focus = resolveNowFocus({ ...baseInput, override: { kind: 'mode', mode: 'dinner' } })
    expect(focus.kind).toBe('override-mode')
    expect((focus as { mode: string }).mode).toBe('dinner')
  })

  it('returns imminent when an imminent entity is present', () => {
    const imminent = { kind: 'event' as const, entity: { title: 'Soccer' }, startTime: new Date() }
    const focus = resolveNowFocus({ ...baseInput, imminent: imminent as any })
    expect(focus.kind).toBe('imminent')
  })

  it('falls back to mode-default for current rhythm', () => {
    const focus = resolveNowFocus({ ...baseInput, rhythmMode: 'dinner' })
    expect(focus.kind).toBe('mode-default')
    expect((focus as { mode: string }).mode).toBe('dinner')
  })
})
