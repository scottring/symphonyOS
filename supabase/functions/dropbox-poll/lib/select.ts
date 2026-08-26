// Which entries in the watched Dropbox folder are new work. Pure, so the
// dedupe rule — the one place a missed or double-billed page comes from — is
// testable without Dropbox.

export interface DropboxEntry {
  '.tag': string
  name: string
  path_lower: string
  server_modified: string
  size: number
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'pdf']

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

/**
 * Strictly newer than the checkpoint, oldest first, capped. Strictly, because
 * the checkpoint is set to a timestamp we HAVE processed — `>=` would re-bill
 * the last page on every tick.
 */
export function selectNewFiles(entries: DropboxEntry[], lastProcessedAtIso: string, cap: number): DropboxEntry[] {
  const since = Date.parse(lastProcessedAtIso)
  return entries
    .filter((e) => e['.tag'] === 'file')
    .filter((e) => ALLOWED_EXT.includes(extOf(e.name)))
    .filter((e) => e.size <= MAX_FILE_BYTES)
    .filter((e) => Date.parse(e.server_modified) > since)
    .sort((a, b) => Date.parse(a.server_modified) - Date.parse(b.server_modified))
    .slice(0, cap)
}

/**
 * The checkpoint advances only past what this run actually attempted — never
 * to now(). A file that lands mid-run, or falls past the cap, must still be
 * waiting on the next tick.
 */
export function maxServerModified(entries: DropboxEntry[], fallbackIso: string): string {
  return entries.reduce(
    (max, e) => (Date.parse(e.server_modified) > Date.parse(max) ? e.server_modified : max),
    fallbackIso,
  )
}
