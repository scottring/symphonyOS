import type { ParsedMessage } from './whatsapp.ts'

export interface DedupeResult {
  fresh: ParsedMessage[]
  newestIso: string | null
}

// Lexicographic comparison is correct because timestamps are zero-padded
// fixed-width "YYYY-MM-DDTHH:mm:ss" strings.
export function filterSince(messages: ParsedMessage[], lastIso: string | null): DedupeResult {
  const fresh = lastIso ? messages.filter((mm) => mm.timestamp > lastIso) : messages.slice()
  const maxInBatch = messages.reduce<string | null>(
    (acc, mm) => (acc === null || mm.timestamp > acc ? mm.timestamp : acc),
    null,
  )
  const newestIso = maxInBatch === null ? lastIso : maxInBatch > (lastIso ?? '') ? maxInBatch : lastIso
  return { fresh, newestIso }
}
