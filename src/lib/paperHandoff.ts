/**
 * Plan-from-paper phone hand-off: the desktop shows a QR code, the phone takes
 * the photo and uploads it to a path both sides can derive from the hand-off
 * id. The storage object is the whole protocol — no table, no channel.
 */

export const HANDOFF_ROUTE = '/paper/phone'

export function newHandoffId(): string {
  return crypto.randomUUID()
}

/** File name inside the user's `page/` folder. */
export function handoffFileName(id: string): string {
  return `handoff-${id}.jpg`
}

/** Folder the desktop polls and the phone uploads into. */
export function handoffFolder(userId: string): string {
  return `${userId}/page`
}

export function handoffStoragePath(userId: string, id: string): string {
  return `${handoffFolder(userId)}/${handoffFileName(id)}`
}

/** Absolute URL the phone opens (encoded in the QR code). */
export function handoffUrl(origin: string, id: string): string {
  return `${origin}${HANDOFF_ROUTE}/${id}`
}
