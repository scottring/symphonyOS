/** "Specials — Ella: Library · Kaleb: Art" → each kid's special, for chips
 *  (2026-10-06). The same title the wall and the week read (planV2.ts);
 *  anything else is not a specials line and returns null. */
const SPECIALS = /^specials?\s*[—–:-]\s*/i

export function parseSpecials(title: string): { who: string; special: string }[] | null {
  if (!SPECIALS.test(title)) return null
  const parts = title.replace(SPECIALS, '').split(/\s*[·,;|]\s*/).map((p) => {
    const m = p.match(/^([^:]+):\s*(.+)$/)
    return m ? { who: m[1].trim(), special: m[2].trim() } : null
  })
  return parts.every(Boolean) && parts.length ? (parts as { who: string; special: string }[]) : null
}
