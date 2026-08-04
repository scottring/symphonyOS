/**
 * Recognises when a search query is naming a FIELD it wants back ("phone
 * number", "email address") rather than contributing search text. Fuse fuzzy-
 * matches the whole query string, so leaving those words in dilutes the term
 * that actually identifies the thing ("podiatrist") with words that are
 * common to nearly every task/contact/project and match everything a little.
 *
 * The parsed intent tells the caller which field to prefer surfacing in a
 * result's subtitle and which results to rank first — see useSearch.
 */

export type FieldIntent = 'phone' | 'email' | 'address'

export interface ParsedQuery {
  /** The query with intent vocabulary removed, trimmed and whitespace-collapsed. */
  terms: string
  intent: FieldIntent | null
}

// Two-word phrases are checked before single words so "phone number" is
// consumed as one instruction (both words stripped) rather than leaving a
// stray "number" behind. "email address" maps to email — "address" alone is
// ambiguous (see WORD_INTENTS) and means the physical/location sense instead.
const PHRASE_INTENTS: Record<string, FieldIntent> = {
  'phone number': 'phone',
  'email address': 'email',
}

const WORD_INTENTS: Record<string, FieldIntent> = {
  phone: 'phone',
  number: 'phone',
  tel: 'phone',
  telephone: 'phone',
  email: 'email',
  'e-mail': 'email',
  address: 'address',
  location: 'address',
  where: 'address',
}

// Word tokens: letters/digits with internal hyphens or apostrophes kept
// (so "e-mail" and "podiatrist's" stay single tokens), everything else
// (punctuation, extra whitespace) dropped. This is also what gives us
// "whitespace-collapsed" output for free when we rejoin with ' '.
const WORD_PATTERN = /[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g

export function parseFieldIntent(query: string): ParsedQuery {
  const tokens = query.match(WORD_PATTERN) ?? []

  const removed = new Set<number>()
  let intent: FieldIntent | null = null

  // Phrase pass: adjacent token pairs, case-insensitive.
  for (let i = 0; i < tokens.length - 1; i++) {
    const phrase = `${tokens[i].toLowerCase()} ${tokens[i + 1].toLowerCase()}`
    const phraseIntent = PHRASE_INTENTS[phrase]
    if (phraseIntent) {
      removed.add(i)
      removed.add(i + 1)
      if (intent === null) intent = phraseIntent
      i++ // don't let the second word of this phrase start another phrase check
    }
  }

  // Single-word pass, skipping anything the phrase pass already claimed.
  tokens.forEach((token, i) => {
    if (removed.has(i)) return
    const wordIntent = WORD_INTENTS[token.toLowerCase()]
    if (wordIntent) {
      removed.add(i)
      if (intent === null) intent = wordIntent
    }
  })

  const survivors = tokens.filter((_, i) => !removed.has(i))

  if (survivors.length === 0) {
    // Every token was intent vocabulary — e.g. the whole query is just
    // "phone" or "phone number". We deliberately null out the intent here
    // rather than keep it with the original words as terms: a query that is
    // ENTIRELY intent vocabulary reads as the user literally searching for
    // that word/phrase ("find the task called Phone"), not as a field
    // instruction layered on top of real search terms. Demoting every
    // non-phone result for a search whose only term IS "phone" would also be
    // circular. So: fall back to plain text, unchanged, no intent.
    return { terms: tokens.join(' '), intent: null }
  }

  return { terms: survivors.join(' '), intent }
}
