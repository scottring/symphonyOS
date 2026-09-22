// src/lib/discussions/openIntent.ts
//
// A row's discussion bubble asks for the item's thread to open along with
// its panel (Scott, 2026-09-22: "i can't click on the bubble to see the
// conversation"). The row selects the item the ordinary way; the panel, as
// it mounts for that item, consumes the intent and opens its Discussion —
// the same thing `?discuss=1` does for the Discussions inbox's deep link,
// without putting a one-shot flag in the URL.

let pending: string | null = null

const key = (kind: string, id: string) => `${kind}:${id}`

/** Ask for `kind:id`'s Discussion to open when its panel next mounts. */
export function requestDiscussionOpen(kind: string, id: string): void {
  pending = key(kind, id)
}

/** True once, for the item the intent was for; anything else leaves it. */
export function consumeDiscussionOpen(kind: string, id: string): boolean {
  if (pending !== key(kind, id)) return false
  pending = null
  return true
}

/** Tests only. */
export function _resetDiscussionOpenIntent(): void { pending = null }
