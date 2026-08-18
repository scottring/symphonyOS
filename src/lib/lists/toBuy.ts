/**
 * "To buy" — purchases don't belong scattered through the Today timeline.
 *
 * A task like "buy pull ups" is not a 9:10 AM commitment; it's a
 * whenever-someone's-near-a-store item. Those live on ONE native, family-shared
 * list (visible to the household, pinnable on the wall), and Today spends
 * exactly one fixed-budget line on them ("To buy · N").
 *
 * Deliberately NOT the Apple-bridged Groceries list: the bridge resurrects
 * deleted rows, and Groceries is grocery-run-scoped in this household — a
 * Target/Costco item parked between "milk" and "eggs" gets skipped.
 *
 * Detection is suggest-and-confirm, never automatic: a buy-ish title grows a
 * one-tap nudge under its row. False positives ("pick up kids") cost one
 * persistent dismissal, which is why the verb list can afford to be generous.
 */
import type { List } from '@/types/list'

export const TO_BUY_LIST_TITLE = 'To buy'

const BUY_VERB_RE = /^(buy|pick\s*up|order|purchase)\s+\S/i

/** Would this task title read as a purchase/errand? ("get" excluded — too broad.) */
export function isBuyish(title: string): boolean {
  return BUY_VERB_RE.test(title.trim())
}

/**
 * The list-item text for a converted task: verb stripped, first letter
 * capitalized. "buy pull ups" → "Pull ups". A list named "To buy" already
 * says the verb; repeating it on every row is noise.
 */
export function buyItemText(title: string): string {
  const stripped = title.trim().replace(BUY_VERB_RE, (m) => m.slice(-1)).trim()
  if (!stripped) return title.trim()
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

/**
 * The canonical To buy list: NATIVE only (never an Apple-bridged list of the
 * same name — see header), title matched case-insensitively.
 */
export function findToBuyList(lists: List[]): List | undefined {
  return lists.find(
    (l) => !l.externalSource && l.title.trim().toLowerCase() === TO_BUY_LIST_TITLE.toLowerCase(),
  )
}

// ── Nudge dismissals ─────────────────────────────────────────────────────────
// Per-task, persistent, localStorage. Per-device is an accepted v1 limitation:
// a cross-device re-nudge costs one tap; a tasks-table column costs a
// migration. Revisit only if the re-nudges actually annoy.

const DISMISS_KEY = 'symphony_tobuy_nudge_dismissed'

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

export function isToBuyNudgeDismissed(taskId: string): boolean {
  return readDismissed().has(taskId)
}

export function dismissToBuyNudge(taskId: string): void {
  try {
    const next = readDismissed()
    next.add(taskId)
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]))
  } catch {
    // Storage unavailable — the nudge just reappears; harmless.
  }
}

// ── Change signal ────────────────────────────────────────────────────────────
// Converting a task (or undoing one) changes the list behind Today's
// "To buy · N" line, which counts via its own fetch. Same-tab writes announce
// here so the line never shows a stale count. (Same reasoning as the tasks
// local-write bus, scoped to this one feature.)

export const TO_BUY_CHANGED_EVENT = 'symphony:tobuy-changed'

export function announceToBuyChanged(): void {
  window.dispatchEvent(new Event(TO_BUY_CHANGED_EVENT))
}
