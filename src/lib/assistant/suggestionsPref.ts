import { useEffect, useState } from 'react'

/**
 * Whether the assistant may put unprompted suggestions on a surface you didn't
 * ask it to.
 *
 * Scoped to the UNPROMPTED tier only — the green lines on Today and the wall
 * rail. Anchored delivery is untouched: chips inside an item you deliberately
 * opened are answers to a question you asked by opening it, and the assistant
 * pane still works when you go to it. Turning this off silences interruption,
 * not the assistant.
 *
 * localStorage rather than a DB column, mirroring the cadence config: this is a
 * per-device preference about how much the app is allowed to talk to you, and
 * the phone and the wall want different answers.
 */
const STORAGE_KEY = 'symphony.assistant.unprompted'

/** Changed in this tab — `storage` only fires in OTHER tabs. */
export const SUGGESTIONS_PREF_EVENT = 'symphony:assistant-unprompted-changed'

/** On by default: a feature nobody has opted out of should still work. */
export function readSuggestionsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSuggestionsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    /* private mode — the toggle just won't persist */
  }
  window.dispatchEvent(new Event(SUGGESTIONS_PREF_EVENT))
}

export function useSuggestionsEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(readSuggestionsEnabled)

  useEffect(() => {
    const sync = () => setEnabled(readSuggestionsEnabled())
    window.addEventListener(SUGGESTIONS_PREF_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SUGGESTIONS_PREF_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return [enabled, setSuggestionsEnabled]
}
