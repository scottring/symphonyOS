/** Detail navigation changes selection, not the week or its layout. */
export function keepsWeekView(previous: { pathname: string; search: string } | null, next: { pathname: string; search: string }): boolean {
  if (!previous || previous.pathname !== next.pathname) return false
  const before = new URLSearchParams(previous.search)
  const after = new URLSearchParams(next.search)
  if (before.get('detail') === after.get('detail')) return false
  before.delete('detail')
  after.delete('detail')
  before.sort()
  after.sort()
  return before.toString() === after.toString()
}
