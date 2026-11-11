// The keyword fallback of symphony_search_notes (AI audit, 2026-11-11).

/** A plain-words query made safe inside a PostgREST or() filter: its commas,
 *  parentheses, dots, quotes and wildcards are filter syntax, so a natural
 *  question ("Kaleb's school, pickup times") broke the keyword fallback. */
export function noteKeyword(query: string): string {
  return query.replace(/[,().:*%"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}
