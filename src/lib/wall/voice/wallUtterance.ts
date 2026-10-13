// What a sentence said to the kitchen wall means (spoken through the wall
// listener, or typed into Tell Symphony). PURE.
//
// The wall is a shared screen and does not guess: a sentence is a kitchen
// command, a capture of a known shape, or a question — anything else is
// "not understood" and saves nothing. Captures go only to household places
// (the grocery list, the scratchpad, the Inbox as a family task); questions
// are answered from what the wall already shows. Nothing here reads or
// writes anything private: a voice is not a sign-in. Household layer only —
// no goals (Scott, 2026-10-13).

import { parseKioskCommand, type KioskCommand } from '@/lib/wall/activity/kioskCommands'

export type WallUtterance =
  | { kind: 'command'; command: KioskCommand }
  | { kind: 'groceries'; items: string[] }
  | { kind: 'talk'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'inbox'; text: string }
  | { kind: 'question'; text: string }
  | { kind: 'unknown'; text: string }

const MAX_ITEMS = 12

/** The sentence as said, minus the wake phrase, fillers and end punctuation. */
export function tidy(input: string): string {
  return input
    .replace(/[’]/g, "'")
    .replace(/^\s*(?:(?:hey|ok|okay|hi)[\s,]+)?symphony\b[\s,.!:-]*/i, '')
    .replace(/^\s*(?:um+|uh+|so|please)[\s,]+/i, '')
    // Whisper often hears a leading "add" as "ad" ("Ad milk to the grocery list").
    .replace(/^\s*ad\s+/i, 'add ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '')
    .trim()
}

const sentence = (s: string) => {
  const t = s.trim().replace(/[.,;:!]+$/, '').replace(/\s+please$/i, '').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

/** "milk, eggs and some bread" → ["milk", "eggs", "bread"]. */
export function groceryItems(list: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i)) {
    const item = raw.trim().replace(/^(?:some|more|a|an|the|a few|a couple of|another)\s+/i, '').replace(/[.!?]+$/, '').trim().toLowerCase()
    if (!item || item.length > 60 || seen.has(item)) continue
    seen.add(item)
    out.push(item)
    if (out.length >= MAX_ITEMS) break
  }
  return out
}

const LIST = String.raw`(?:the |our |my )?(?:grocery|groceries|shopping|to buy|to-buy)(?: list)?`
const MISSING = /^(?:what'?s|what is|whats|everything|the stuff|what we'?re) missing$|^missing$/i
const QUESTION = /^(?:what|what's|whats|when|when's|where|where's|who|who's|whose|which|how|how's|is|are|am|do|does|did|can|could|will|would|should|has|have|any|anything|tell me|remind me what|remind me when)\b/i

/** One sentence → what it means on the wall. */
export function readUtterance(input: string): WallUtterance {
  const text = tidy(input)
  if (!text) return { kind: 'unknown', text }

  // Groceries first: "add milk to the groceries" names what to add; only
  // "add what's missing" is the dinner command.
  const toList = text.match(new RegExp(String.raw`^(?:add|put|stick|throw) (.+?) (?:to|on|onto|in) ${LIST}$`, 'i'))
  if (toList) {
    if (MISSING.test(toList[1].trim())) return { kind: 'command', command: { type: 'add-missing' } }
    const items = groceryItems(toList[1])
    if (items.length) return { kind: 'groceries', items }
  }
  const need = text.match(/^(?:we need|we're out of|we are out of|we're low on|we are low on|we ran out of|buy|we should buy|get some) (?!to\b)(.+)$/i)
  if (need) {
    const items = groceryItems(need[1])
    if (items.length) return { kind: 'groceries', items }
  }

  const command = parseKioskCommand(text)
  if (command) return { kind: 'command', command }

  const talk = text.match(/^(?:(?:we should|we need to|we have to|let's|lets|let us|remember to|i want to|can we|we must) )?(?:talk|chat|have a talk) about (.+)$/i)
  if (talk) return { kind: 'talk', text: sentence(talk[1]) }

  const note = text.match(/^(?:(?:leave|make|add|write) a note|note)(?: that| to say|:)? (.+)$/i)
  if (note) return { kind: 'note', text: sentence(note[1]) }

  const inbox = text.match(/^(?:remind (?:us|me|everyone|the family) to|don't forget to|do not forget to|we need to|we have to|add a task to|add a task|new task|to ?do) (.+)$/i)
    ?? text.match(/^(?:add|put) (.+?) (?:to|in|on|into) (?:the |our )?inbox$/i)
  if (inbox) return { kind: 'inbox', text: sentence(inbox[1]) }

  if (QUESTION.test(text) || /\?\s*$/.test(input)) return { kind: 'question', text: sentence(text.replace(/\?+$/, '')) + '?' }

  return { kind: 'unknown', text }
}
