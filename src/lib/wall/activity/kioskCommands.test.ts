import { describe, it, expect } from 'vitest'
import { parseKioskCommand, describeKioskCommand, KIOSK_PHRASES, readVoiceOptIn, writeVoiceOptIn, VOICE_OPT_IN_KEY } from './kioskCommands'

describe('parseKioskCommand', () => {
  it.each([
    ["What's for dinner?", { type: 'show-dinner' }],
    ['what is for dinner', { type: 'show-dinner' }],
    ['Hey Symphony, show me dinner', { type: 'show-dinner' }],
    ['We have 6 people', { type: 'set-serves', serves: 6 }],
    ['we have six people tonight', { type: 'set-serves', serves: 6 }],
    ["there's five of us", { type: 'set-serves', serves: 5 }],
    ['cook for 8', { type: 'set-serves', serves: 8 }],
    ['Add what’s missing', { type: 'add-missing' }],
    ['add the missing to the groceries', { type: 'add-missing' }],
    ['Start cooking', { type: 'start-cooking' }],
    ["let's cook", { type: 'start-cooking' }],
    ['next', { type: 'next-step' }],
    ['Next step please', { type: 'next-step' }],
    ['back a step', { type: 'prev-step' }],
    ['go back one step', { type: 'prev-step' }],
    ['previous step', { type: 'prev-step' }],
    ['timer 5 minutes', { type: 'start-timer', minutes: 5 }],
    ['set a timer for twenty five minutes', { type: 'start-timer', minutes: 25 }],
    ['10 minute timer', { type: 'start-timer', minutes: 10 }],
    ['timer for a minute', { type: 'start-timer', minutes: 1 }],
    ['set a timer for 1 hour', { type: 'start-timer', minutes: 60 }],
    ['stop the timer', { type: 'stop-timer' }],
    ['back to cooking', { type: 'resume-cooking' }],
    ['continue cooking', { type: 'resume-cooking' }],
    ['home', { type: 'home' }],
    ['go home', { type: 'home' }],
    ['back', { type: 'back' }],
  ])('%s', (input, expected) => {
    expect(parseKioskCommand(input)).toEqual(expected)
  })

  it('a timer is never read as servings, nor servings as a timer', () => {
    expect(parseKioskCommand('timer for 6 minutes')).toEqual({ type: 'start-timer', minutes: 6 })
    expect(parseKioskCommand('we have 6 people')?.type).toBe('set-serves')
  })

  it('does not guess: anything outside the set is null', () => {
    for (const s of ['', '   ', 'call grandma', 'what is the weather', 'dinner for', 'buy milk', 'we have 0 people', 'we have 99 people']) {
      expect(parseKioskCommand(s)).toBeNull()
    }
  })

  it('every panel phrase parses to its own command (taps and speech are the same command)', () => {
    for (const p of KIOSK_PHRASES) expect(parseKioskCommand(p.label)).toEqual(p.command)
  })

  it('describes each command plainly', () => {
    expect(describeKioskCommand({ type: 'start-timer', minutes: 5 })).toBe('Timer · 5 min')
    expect(describeKioskCommand({ type: 'set-serves', serves: 6 })).toBe('Serving 6')
  })
})

describe('voice opt-in', () => {
  it('is off by default and only on when explicitly turned on', () => {
    const map = new Map<string, string>()
    const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, removeItem: (k: string) => { map.delete(k) } }
    expect(readVoiceOptIn(store)).toBe(false)
    writeVoiceOptIn(store, true)
    expect(map.get(VOICE_OPT_IN_KEY)).toBe('on')
    expect(readVoiceOptIn(store)).toBe(true)
    writeVoiceOptIn(store, false)
    expect(readVoiceOptIn(store)).toBe(false)
    expect(readVoiceOptIn(null)).toBe(false)
  })
})
