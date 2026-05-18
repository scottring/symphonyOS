/**
 * Format an inbox item as the bullet line appended to a note's content
 * when the user routes the item via the `📝 Note` triage action.
 *
 * Shape:
 *   - YYYY-MM-DD HH:MM — <title>
 *     <indented notes on a second line, if present>
 */
export function formatInboxBullet(
  item: { title: string; notes?: string },
  now: Date,
): string {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const stamp = `${yyyy}-${mm}-${dd} ${hh}:${mi}`

  const head = `- ${stamp} — ${item.title}`
  if (!item.notes) return head
  return `${head}\n  ${item.notes}`
}
