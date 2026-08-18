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

/** OFF by default (2026-08-18): the unprompted tier is opt-in per device.
 *  It used to default on, and on a sparse day the assistant's reasoning
 *  paragraph out-shouted the schedule. The ⋯ menu's "Show suggestions · N"
 *  toggle is the single control and carries the count, so the tier stays
 *  discoverable without spending page space uninvited. */
export function readSuggestionsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
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
