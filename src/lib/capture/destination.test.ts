import { describe, it, expect } from 'vitest'
import { audienceLabel, contextLabel, destinationLine, hiddenByView } from './destination'

describe('capture destination', () => {
  it('says who will see it: Family is shared, everything else is only you', () => {
    expect(audienceLabel('family')).toBe('shared with household')
    expect(audienceLabel('work')).toBe('only you')
    expect(audienceLabel('personal')).toBe('only you')
    expect(audienceLabel(null)).toBe('only you')
    expect(contextLabel(null)).toBe('Unsorted')
    expect(contextLabel('family')).toBe('Family')
  })

  it('names the destination for each kind of capture', () => {
    expect(destinationLine({ kind: 'inbox', context: null })).toBe('→ Inbox · Unsorted · only you')
    expect(destinationLine({ kind: 'inbox', context: 'family' })).toBe('→ Inbox · Family · shared with household')
    expect(destinationLine({ kind: 'dated', context: 'personal', when: new Date(2026, 8, 23) })).toBe('→ Wed, Sep 23 · Personal · only you')
    expect(destinationLine({ kind: 'event', context: 'personal', calendarName: 'Scott Personal' })).toBe('→ Scott Personal')
    expect(destinationLine({ kind: 'event', context: null })).toBe('→ your primary calendar')
    expect(destinationLine({ kind: 'routine', context: 'family' })).toBe('→ Routines · Family · shared with household')
    expect(destinationLine({ kind: 'note', context: null })).toBe('→ Notes')
  })

  it('knows when the current view would hide the new item', () => {
    expect(hiddenByView(null, new Set(['family']))).toBe(true)
    expect(hiddenByView(null, new Set(['family', 'unsorted']))).toBe(false)
    expect(hiddenByView('personal', new Set(['family']))).toBe(true)
    expect(hiddenByView('family', new Set(['family']))).toBe(false)
  })
})
