import { describe, it, expect, beforeEach } from 'vitest'
import {
  readSuggestionsEnabled, setSuggestionsEnabled, SUGGESTIONS_PREF_EVENT,
} from './suggestionsPref'

beforeEach(() => localStorage.clear())

describe('suggestions preference', () => {
  it('is on until turned off — a feature nobody opted out of still works', () => {
    expect(readSuggestionsEnabled()).toBe(true)
  })

  it('persists off, and back on', () => {
    setSuggestionsEnabled(false)
    expect(readSuggestionsEnabled()).toBe(false)
    setSuggestionsEnabled(true)
    expect(readSuggestionsEnabled()).toBe(true)
  })

  it('announces the change in THIS tab', () => {
    // `storage` only fires in other tabs, so the surface that flipped the
    // toggle would never hear its own change and would keep rendering.
    let heard = 0
    const bump = () => { heard += 1 }
    window.addEventListener(SUGGESTIONS_PREF_EVENT, bump)
    setSuggestionsEnabled(false)
    window.removeEventListener(SUGGESTIONS_PREF_EVENT, bump)
    expect(heard).toBe(1)
  })

  it('treats an unreadable store as on rather than silently muting', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('blocked') },
    })
    expect(readSuggestionsEnabled()).toBe(true)
    Object.defineProperty(window, 'localStorage', original)
  })
})
