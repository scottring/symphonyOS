/** Pages that carry the docked conversation: the three destinations and Routines. */
export function conversationStripPath(pathname: string): boolean {
  return pathname === '/' || ['/today', '/week', '/month', '/season', '/year', '/routines'].some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
